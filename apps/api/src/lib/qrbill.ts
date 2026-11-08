import PDFDocument from "pdfkit";
import { SwissQRBill } from "swissqrbill/pdf";
import { PassThrough } from "node:stream";
import type { Prisma } from "@prisma/client";

type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: { lines: true; customer: true; vehicle: true } }>;
type Settings = Prisma.SettingGetPayload<Record<string, never>>;

/** Modulo-10-rekursiv: gültige 27-stellige QR-Referenz aus einer Basis (z.B. Belegnummer). */
export function qrReference(base: string): string {
  const digits = base.replace(/\D/g, "").padStart(26, "0").slice(-26);
  const carry = [0, 9, 4, 6, 8, 2, 7, 1, 3, 6];
  let c = 0;
  for (const ch of digits) c = carry[(c + Number(ch)) % 10];
  return digits + String((10 - c) % 10);
}

const S = (v: unknown) => (v == null ? "" : String(v));
const CHF = (n: unknown) => `CHF ${Number(n ?? 0).toFixed(2)}`;
const dateDe = (d: Date) => d.toLocaleDateString("de-CH");

/**
 * Komplette Rechnungs-PDF (A4) mit QR-Zahlteil (swissqrbill, Seiten 2+ bzw. unten).
 * Layout: Kopf, Kunde, Fahrzeug, Positionen, MwSt-Gruppen, Total, Footer.
 */
export async function buildInvoicePdf(
  invoice: InvoiceWithLines,
  settings: Settings
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    const pass = new PassThrough();
    pass.on("data", (c: Buffer) => chunks.push(c));
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    doc.pipe(pass);
  });

  const page = doc.addPage({ size: "A4", margin: 40 });
  const left = 40;
  let y = 80;

  // Kopf
  page.fontSize(16).font("Helvetica-Bold").text(settings.companyName, left, y);
  page.fontSize(16).text(`Rechnung ${invoice.number}`, 340, y, { width: 215, align: "right" });
  y += 22;
  page.fontSize(9).font("Helvetica");
  for (const line of [settings.addressLine, `${settings.zip} ${settings.city}`.trim(), settings.phone, settings.email].filter(Boolean)) {
    page.text(S(line), left, y);
    y += 12;
  }
  page.text(`Datum: ${dateDe(invoice.date)}`, 340, 102, { width: 215, align: "right" });
  page.text(`Fällig: ${dateDe(invoice.dueDate)}`, 340, 114, { width: 215, align: "right" });
  if (invoice.type === "CREDIT_NOTE") {
    page.fontSize(12).font("Helvetica-Bold").fillColor("#b00020").text("GUTSCHRIFT", 340, 126, { width: 215, align: "right" }).fillColor("#000");
  }

  // Kunde
  y += 18;
  const c = invoice.customer;
  const customerName = c.company ?? [c.firstName, c.lastName].filter(Boolean).join(" ");
  page.fontSize(11).font("Helvetica-Bold").text(S(customerName), left, y);
  y += 15;
  page.fontSize(9).font("Helvetica");
  for (const line of [S(c.street), `${S(c.zip)} ${S(c.city)}`.trim()].filter(Boolean)) {
    page.text(line, left, y);
    y += 12;
  }

  if (invoice.vehicle) {
    y += 12;
    page.text(`Fahrzeug: ${invoice.vehicle.licensePlate} · ${invoice.vehicle.brand} ${invoice.vehicle.model}`, left, y);
  }

  // Positionen (Tabelle)
  y += 26;
  const cols = { pos: left, desc: left + 24, qty: 320, unit: 390, price: 440, total: 480 };
  page.fontSize(8).font("Helvetica-Bold");
  page.text("Pos", cols.pos, y);
  page.text("Beschreibung", cols.desc, y);
  page.text("Menge", cols.qty, y);
  page.text("Einh.", cols.unit, y);
  page.text("E-Preis", cols.price, y);
  page.text("Total", cols.total, y);
  y += 12;
  page.moveTo(left, y).lineTo(555, y).lineWidth(0.7).stroke();
  y += 8;

  page.font("Helvetica").fontSize(9);
  for (const line of invoice.lines) {
    const lineTotal = Number(line.qty) * Number(line.unitPrice);
    page.text(String(line.position + 1), cols.pos, y);
    page.text(line.description.length > 50 ? `${line.description.slice(0, 50)}…` : line.description, cols.desc, y, { width: 280, ellipsis: true });
    page.text(Number(line.qty).toFixed(2), cols.qty, y);
    page.text(line.unit, cols.unit, y);
    page.text(Number(line.unitPrice).toFixed(2), cols.price, y);
    page.text(lineTotal.toFixed(2), cols.total, y);
    y += 15;
  }
  y += 4;
  page.moveTo(left, y).lineTo(555, y).lineWidth(0.7).stroke();
  y += 14;

  // Summen mit MwSt-Gruppen (MWSTG-Ausweis)
  const right = (label: string, value: string, isBold = false) => {
    page.fontSize(10).font(isBold ? "Helvetica-Bold" : "Helvetica");
    page.text(label, 360, y, { width: 120 });
    page.text(value, 480, y, { width: 75, align: "right" });
    y += 15;
  };
  right("Zwischensumme", CHF(invoice.totalNet));
  if (invoice.vatScheme === "SMALL_BUSINESS") {
    right("MwSt (Kleingeschäft, nicht ausgewiesen)", "—");
  } else {
    const groups = new Map<number, number>();
    for (const line of invoice.lines) {
      const rate = Number(line.vatRate);
      groups.set(rate, (groups.get(rate) ?? 0) + Number(line.qty) * Number(line.unitPrice));
    }
    for (const [rate, net] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      right(`MwSt ${rate.toFixed(1).replace(".0", "")} %`, CHF(Math.round(((net * rate) / 100) * 100) / 100));
    }
  }
  right("Total", CHF(invoice.total), true);
  const paid = Number(invoice.paidTotal);
  if (paid > 0) {
    right("Bereits bezahlt", `− ${CHF(paid)}`);
    right("Offen", CHF(Number(invoice.total) - paid), true);
  }

  page.fontSize(8).font("Helvetica");
  page.text(S(settings.invoiceFooter), left, 780, { width: 515 });

  // QR-Zahlteil (eigene Seite, swissqrbill rendert Spez-konform)
  const account = (settings.qrIban || settings.iban).replace(/\s/g, "");
  const isQrIban = /^CH\d{2}3/.test(account);
  const data = {
    currency: "CHF" as const,
    amount: Math.max(0.01, Number(invoice.total) - paid),
    creditor: {
      account,
      name: settings.companyName,
      address: settings.addressLine,
      zip: settings.zip,
      city: settings.city,
      country: "CH",
    },
    debtor: {
      name: customerName || "Kunde",
      address: S(c.street),
      zip: S(c.zip),
      city: S(c.city),
      country: "CH",
    },
    reference: isQrIban ? qrReference(invoice.number) : undefined,
    unstructuredMessage: `${invoice.type === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung"} ${invoice.number}`,
  };
  const qrBill = new SwissQRBill(data);
  qrBill.attachTo(page);

  doc.end();
  return done;
}

/** Mahnungs-PDF: Referenz auf Originalrechnung, Mahnstufe, Gebühr, neuer offener Betrag (kein QR-Teil). */
export async function buildReminderPdf(
  invoice: InvoiceWithLines,
  settings: Settings,
  level: number,
  fee: number
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    const pass = new PassThrough();
    pass.on("data", (c: Buffer) => chunks.push(c));
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    doc.pipe(pass);
  });

  const page = doc.addPage({ size: "A4", margin: 40 });
  const left = 40;
  let y = 80;

  // Kopf
  page.fontSize(16).font("Helvetica-Bold").text(settings.companyName, left, y);
  page.fontSize(14).font("Helvetica-Bold").fillColor("#b00020").text(
    level >= 3 ? "3. Mahnung — Letzte Mahnung" : `${level}. Mahnung`,
    340, y, { width: 215, align: "right" }
  ).fillColor("#000");
  y += 22;
  page.fontSize(9).font("Helvetica");
  for (const line of [settings.addressLine, `${settings.zip} ${settings.city}`.trim(), settings.phone, settings.email].filter(Boolean)) {
    page.text(S(line), left, y);
    y += 12;
  }

  // Kunde
  y += 18;
  const c = invoice.customer;
  const customerName = c.company ?? [c.firstName, c.lastName].filter(Boolean).join(" ");
  page.fontSize(11).font("Helvetica-Bold").text(customerName || "Kunde", left, y);
  y += 15;
  page.fontSize(10).font("Helvetica");
  for (const line of [S(c.street), [S(c.zip), S(c.city)].filter(Boolean).join(" ")].filter(Boolean)) {
    page.text(line, left, y);
    y += 13;
  }

  // Anschreiben
  y += 24;
  const total = Number(invoice.total);
  const paid = Number(invoice.paidTotal);
  const open = total - paid + fee;
  const daysKey = ("reminderLevel" + level + "Days") as keyof Settings;
  const days = Number(settings[daysKey]) || 14;
  page.fontSize(11).font("Helvetica-Bold").text(`Betreff: Rechnung ${invoice.number} vom ${dateDe(invoice.date)}`, left, y);
  y += 24;
  page.fontSize(10).font("Helvetica").text(
    `Sehr geehrte Damen und Herren\n\n` +
    `Trotz Fälligkeit am ${dateDe(invoice.dueDate)} ist unsere Rechnung ${invoice.number} bis heute ` +
    `unbezahlt geblieben. Wir müssen daher eine Mahngebühr von CHF ${fee.toFixed(2)} in Rechnung stellen.\n\n` +
    `Bitte begleichen Sie den offenen Betrag innert ${days} Tagen.`,
    left, y, { width: 515, lineGap: 3 }
  );

  // Rekapitulation
  y += 120;
  const right = (label: string, value: string, bold = false) => {
    page.fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica").text(label, left, y);
    page.text(value, 340, y, { width: 215, align: "right" });
    y += 17;
  };
  right("Rechnungsbetrag", CHF(total));
  if (paid > 0) right("Bereits bezahlt", `− ${CHF(paid)}`);
  if (fee > 0) right(`Mahngebühr (${level}. Mahnung)`, CHF(fee));
  right("Neu offen", CHF(open), true);

  page.fontSize(8).font("Helvetica");
  page.text(S(settings.invoiceFooter), left, 780, { width: 515 });

  doc.end();
  return done;
}

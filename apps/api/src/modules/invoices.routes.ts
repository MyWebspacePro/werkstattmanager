import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";
import { nextDocNumber } from "../lib/numbers.js";
import { computeTotals } from "../lib/money.js";
import { buildInvoicePdf, buildReminderPdf } from "../lib/qrbill.js";
import { renderTemplate, sendMail } from "../lib/mailer.js";

const lineSchema = z.object({
  type: z.enum(["LABOR", "PART", "EXTERNAL", "FLAT"]).default("FLAT"),
  description: z.string().min(1),
  qty: z.coerce.number().min(0).default(1),
  unit: z.string().default("x"),
  unitPrice: z.coerce.number().min(0).default(0),
  vatRate: z.coerce.number().min(0).max(30).default(8.1),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().optional(),
  orderId: z.string().optional(),
  type: z.enum(["INVOICE", "CREDIT_NOTE"]).default("INVOICE"),
  notes: z.string().optional(),
  lines: z.array(lineSchema).default([]),
});

async function loadFull(id: string) {
  return prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } }, customer: true, vehicle: true, payments: true, order: true },
  });
}

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/invoices", async (req) => {
    const { status, q, from, to, skip = 0, take = 25, open } = (req.query ?? {}) as Record<string, string>;
    const where: Record<string, unknown> = { archived: false };
    if (status) where.status = status;
    if (open === "true") where.status = { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] };
    if (from || to) where.date = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { date: "desc" },
        skip: Number(skip),
        take: Math.min(Number(take), 100),
        include: {
          customer: { select: { firstName: true, lastName: true, company: true } },
          vehicle: { select: { licensePlate: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/invoices/:id", async (req) => {
    const { id } = req.params as { id: string };
    return prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { position: "asc" } }, customer: true, vehicle: true, payments: { orderBy: { date: "desc" } }, reminders: { orderBy: { date: "asc" } }, order: { select: { id: true, number: true } } },
    });
  });

  // Neue Rechnung: aus Auftrag (Positionen übernehmen) oder frei
  app.post("/invoices", async (req) => {
    const body = createSchema.parse(req.body);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const scheme = settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD";

    let lines = body.lines;
    if (body.orderId && lines.length === 0 && body.type !== "CREDIT_NOTE") {
      const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: body.orderId }, include: { lines: true } });
      lines = order.lines.map((l) => ({
        type: l.type, description: l.description, qty: Number(l.qty), unit: l.unit,
        unitPrice: Number(l.unitPrice), vatRate: Number(l.vatRate),
      }));
    }
    // Kreditnota (MWSTG): negative Beträge — Mengen negieren, Totals werden negativ
    if (body.type === "CREDIT_NOTE") {
      lines = lines.map((l) => ({ ...l, qty: -Math.abs(Number(l.qty)) }));
    }
    const totals = computeTotals(lines, scheme);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.paymentTermsDays);

    const invoice = await prisma.invoice.create({
      data: {
        number: await nextDocNumber(body.type === "CREDIT_NOTE" ? "credit" : "invoice"),
        type: body.type,
        customerId: body.customerId,
        vehicleId: body.vehicleId ?? null,
        orderId: body.type === "CREDIT_NOTE" ? null : (body.orderId ?? null),
        status: "DRAFT",
        dueDate,
        totalNet: totals.net,
        totalVat: totals.vat,
        total: totals.total,
        vatScheme: scheme,
        notes: body.notes,
        lines: { create: lines.map((l, i) => ({ ...l, position: i })) },
      },
    });
    if (body.orderId && body.type !== "CREDIT_NOTE") {
      await prisma.workOrder.update({ where: { id: body.orderId }, data: { status: "INVOICED" } });
    }
    await audit(req.user!.id, "CREATE", "Invoice", invoice.id, { number: invoice.number });
    return loadFull(invoice.id);
  });

  // Statusübergänge
  app.patch("/invoices/:id/status", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(["DRAFT", "SENT", "CANCELLED", "CREDITED"]) }).parse(req.body);
    const invoice = await prisma.invoice.update({ where: { id }, data: { status } });
    await audit(req.user!.id, "STATUS", "Invoice", id, { status });
    return invoice;
  });

  // Zahlung erfassen (Bar, Karte, Twint, Überweisung …)
  app.post("/invoices/:id/payments", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      amount: z.coerce.number().positive(),
      method: z.enum(["CASH", "CARD", "TWINT", "QR_INVOICE", "TRANSFER", "OTHER"]).default("TRANSFER"),
      date: z.coerce.date().optional(),
      reference: z.string().optional(),
      note: z.string().optional(),
    }).parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });
      await tx.payment.create({
        data: { invoiceId: id, amount: body.amount, method: body.method, date: body.date ?? new Date(), reference: body.reference, note: body.note },
      });
      const paidTotal = invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + body.amount;
      const total = Number(invoice.total);
      const status = paidTotal >= total - 0.001 ? "PAID" : paidTotal > 0 ? "PARTIALLY_PAID" : invoice.status;
      const updated = await tx.invoice.update({ where: { id }, data: { paidTotal, status: status as never } });
      if (status === "PAID" && invoice.orderId) {
        await tx.workOrder.update({ where: { id: invoice.orderId }, data: { status: "PAID" } });
      }
      return updated;
    });
    await audit(req.user!.id, "PAYMENT", "Invoice", id, { amount: body.amount, method: body.method });
    return result;
  });

  // Mahnung erstellen (Level +1): Mahn-PDF + E-Mail (wenn Kundin/Kunde E-Mail hat), Status OVERDUE
  app.post("/invoices/:id/remind", async (req, reply) => {
    const { id } = req.params as { id: string };
    const invoice = await loadFull(id);
    if (["PAID", "CANCELLED", "CREDITED"].includes(invoice.status)) {
      return reply.code(400).send({ error: "Rechnung ist bereits beglichen/annulliert" });
    }
    if (invoice.reminderLevel >= 3) {
      return reply.code(400).send({ error: "Maximal 3 Mahnstufen — Betreibung über Inkasso-Büro" });
    }
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const level = invoice.reminderLevel + 1;
    const fees = [Number(settings.reminderFee1), Number(settings.reminderFee2), Number(settings.reminderFee3)];
    const fee = fees[level - 1] ?? 0;

    let sentTo: string | null = null;
    let warning: string | null = null;
    const to = invoice.customer.email;
    if (to) {
      try {
        const tpl = await prisma.textTemplate.findUnique({ where: { key: "reminder.email" } });
        const customerName = invoice.customer.company ?? [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(" ");
        const unpaid = Number(invoice.total) - Number(invoice.paidTotal) + fee;
        const vars = {
          customerName: customerName || "Kunde",
          invoiceNumber: invoice.number,
          reminderLevel: String(level),
          fee: fee.toFixed(2),
          unpaid: `CHF ${unpaid.toFixed(2)}`,
          companyName: settings.companyName,
        };
        const pdf = await buildReminderPdf(invoice, settings, level, fee);
        await sendMail(
          to,
          renderTemplate(tpl?.subject ?? `{{reminderLevel}}. Mahnung Rechnung {{invoiceNumber}}`, vars),
          renderTemplate(tpl?.body ?? "", vars),
          [{ filename: `Mahnung-${invoice.number}.pdf`, content: pdf }],
        );
        sentTo = to;
      } catch (err) {
        warning = `Mahnung registriert, aber E-Mail-Versand fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannt"}`;
      }
    } else {
      warning = "Kunde hat keine E-Mail-Adresse — Mahnung bitte drucken und per Post senden";
    }

    await prisma.reminder.create({ data: { invoiceId: id, level, sentTo: sentTo ?? undefined } });
    await prisma.invoice.update({ where: { id }, data: { reminderLevel: level, status: "OVERDUE" } });
    await audit(req.user!.id, "REMIND", "Invoice", id, { level, fee, sentTo });
    return prisma.invoice.findUniqueOrThrow({ where: { id }, include: { reminders: true, payments: true } }).then((r) => ({ ...r, fee, sentTo, warning }));
  });

  // Mahnungs-PDF herunterladen (letzte Stufe oder ?level=n)
  app.get("/invoices/:id/reminder-pdf", async (req, reply) => {
    const { id } = req.params as { id: string };
    const level = Number((req.query as { level?: string }).level) || undefined;
    const invoice = await loadFull(id);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const l = level ?? Math.max(invoice.reminderLevel, 1);
    const fees = [Number(settings.reminderFee1), Number(settings.reminderFee2), Number(settings.reminderFee3)];
    const pdf = await buildReminderPdf(invoice, settings, l, fees[l - 1] ?? 0);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="Mahnung-${invoice.number}.pdf"`);
    return reply.send(pdf);
  });

  // PDF mit QR-Zahlteil herunterladen
  app.get("/invoices/:id/pdf", async (req, reply) => {
    const { id } = req.params as { id: string };
    const invoice = await loadFull(id);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const pdf = await buildInvoicePdf(invoice, settings);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
    return reply.send(pdf);
  });

  // Rechnung per E-Mail versenden (PDF im Anhang, Template aus TextTemplate)
  app.post("/invoices/:id/send", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ email: z.string().email().optional() }).parse(req.body ?? {});
    const invoice = await loadFull(id);
    const to = body.email ?? invoice.customer.email;
    if (!to) return reply.code(400).send({ error: "Kunde hat keine E-Mail-Adresse" });

    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const tpl = await prisma.textTemplate.findUnique({ where: { key: "invoice.email" } });
    const customerName = invoice.customer.company ?? [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(" ");
    const vars = {
      customerName: customerName || "Kunde",
      invoiceNumber: invoice.number,
      total: `CHF ${Number(invoice.total).toFixed(2)}`,
      companyName: settings.companyName,
    };
    const pdf = await buildInvoicePdf(invoice, settings);
    await sendMail(
      to,
      renderTemplate(tpl?.subject ?? `Rechnung {{invoiceNumber}}`, vars),
      renderTemplate(tpl?.body ?? "", vars),
      [{ filename: `${invoice.number}.pdf`, content: pdf }]
    );
    if (invoice.status === "DRAFT") {
      await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
    }
    await audit(req.user!.id, "INVOICE_SEND", "Invoice", id, { to });
    return { ok: true, sentTo: to };
  });

  // Buchhaltungs-Export (CSV, KMU-Kontenrahmen-Rohdaten)
  app.get("/invoices/export", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const { from, to } = (req.query ?? {}) as { from?: string; to?: string };
    const where: Record<string, unknown> = {};
    if (from || to) where.date = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { date: "asc" },
      include: { customer: true, payments: true },
    });
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["Datum", "Belegnr", "Typ", "Debitor", "Netto", "MWST", "Total", "Bezahlt", "Offen", "Status"].join(";"),
      ...invoices.map((inv) =>
        [
          inv.date.toISOString().slice(0, 10),
          inv.number,
          inv.type,
          inv.customer.company ?? `${inv.customer.firstName ?? ""} ${inv.customer.lastName ?? ""}`.trim(),
          Number(inv.totalNet).toFixed(2),
          Number(inv.totalVat).toFixed(2),
          Number(inv.total).toFixed(2),
          Number(inv.paidTotal).toFixed(2),
          (Number(inv.total) - Number(inv.paidTotal)).toFixed(2),
          inv.status,
        ].map(esc).join(";")
      ),
    ].join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="buchhaltung_export_${new Date().toISOString().slice(0, 10)}.csv"`);
    return reply.send(`\uFEFF${rows}`);
  });
}

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed startet…");

  // Einstellungen (Singleton)
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "Demo Garage Muster AG",
      addressLine: "Musterstrasse 12",
      zip: "8200",
      city: "Schaffhausen",
      phone: "+41 52 000 00 00",
      email: "info@demogarage.ch",
      vatNumber: "CHE-123.456.789 MWST",
      vatScheme: "STANDARD",
      iban: "CH93 0076 2011 6238 5295 7",
      qrIban: "CH44 3199 9123 0008 8901 2",
      bankName: "Demo Bank",
      defaultLaborRate: 145,
    },
  });

  // Nutzer (Passwörter NUR für lokale Entwicklung!)
  const hash = bcrypt.hashSync("changeme", 10);
  await prisma.user.upsert({
    where: { email: "chef@werkstatt.ch" },
    update: {},
    create: { email: "chef@werkstatt.ch", passwordHash: hash, name: "Chef", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "annahme@werkstatt.ch" },
    update: {},
    create: { email: "annahme@werkstatt.ch", passwordHash: hash, name: "Annahme", role: "STAFF" },
  });

  // Ressourcen: Hebebühnen + Arbeitsplatz
  const resources = [
    { name: "Hebebühne 1", type: "LIFT" as const },
    { name: "Hebebühne 2", type: "LIFT" as const },
    { name: "Mechaniker 1", type: "MECHANIC" as const },
    { name: "Mechaniker 2", type: "MECHANIC" as const },
  ];
  for (const r of resources) {
    if (!(await prisma.resource.findFirst({ where: { name: r.name } }))) {
      await prisma.resource.create({ data: r });
    }
  }

  // Lieferanten
  for (const name of ["Hostettler autotechnik", "Auto Teile Fischer AG"]) {
    if (!(await prisma.supplier.findFirst({ where: { name } }))) {
      await prisma.supplier.create({ data: { name } });
    }
  }

  // Textvorlagen
  const templates = [
    {
      key: "invoice.email",
      subject: "Rechnung {{invoiceNumber}} — {{companyName}}",
      body:
        "Guten Tag {{customerName}}\n\nIm Anhang finden Sie die Rechnung {{invoiceNumber}} über CHF {{total}}.\n\nFreundliche Grüsse\n{{companyName}}",
    },
    {
      key: "tyre.season",
      subject: "Reifenwechsel — Ihre Saisonräder sind bereit",
      body:
        "Guten Tag {{customerName}}\n\nDie Saisonzeit rückt näher: Ihre eingelagerten Räder ({{slotCode}}) sind bereit für den Wechsel. Melden Sie sich für einen Termin.\n\nFreundliche Grüsse\n{{companyName}}",
    },
  ];
  for (const t of templates) {
    await prisma.textTemplate.upsert({ where: { key: t.key }, update: {}, create: t });
  }

  console.log("Seed fertig: chef@werkstatt.ch / annahme@werkstatt.ch — Passwort: changeme");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

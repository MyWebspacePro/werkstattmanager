/**
 * Demo-Daten für Fabios Mech_Box GmbH (fabios-mechbox.ch) — NUR für die lokale Dev-DB!
 *   npx tsx --env-file=.env prisma/seed-demo.ts
 * Idempotent: existierende E-Mails/Kennzeichen/Termine werden übersprungen.
 * Team real gemäss fabios-mechbox.ch/team (Stand 11/2026).
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

const PW = "mechbox2026";

async function main() {
  // ── Stammdaten der Werkstatt ────────────────────────────────────────────────
  await prisma.setting.update({
    where: { id: 1 },
    data: {
      companyName: "Fabios Mech_Box GmbH",
      addressLine: "Solenbergstrasse 15",
      zip: "8207",
      city: "Schaffhausen",
      phone: "+41 52 643 14 22",
      email: "info@fabios-mechbox.ch",
      website: "www.fabios-mechbox.ch",
      invoiceFooter: "Fabios Mech_Box GmbH · Bosch Service Partner · Solenbergstrasse 15, 8207 Schaffhausen",
    },
  });
  console.log("✓ Stammdaten: Fabios Mech_Box GmbH");

  // ── Team (real gemäss Website) ──────────────────────────────────────────────
  const hash = bcrypt.hashSync(PW, 10);
  const team = [
    { email: "jorge@fabios-mechbox.ch",  name: "Jorge Fernandez",  jobTitle: "Werkstattchef",                 role: "ADMIN"    },
    { email: "andy@fabios-mechbox.ch",   name: "Andy Schwendener", jobTitle: "Kundendienst (Annahme)",        role: "STAFF"    },
    { email: "ramona@fabios-mechbox.ch", name: "Ramona Conti",     jobTitle: "Buchhaltung & Administration",  role: "STAFF"    },
    { email: "michael@fabios-mechbox.ch",name: "Michael Jauch",    jobTitle: "Kundendienst",                  role: "STAFF"    },
    { email: "jason@fabios-mechbox.ch",  name: "Jason Pagnin",     jobTitle: "Automobil-Diagnostiker",        role: "MECHANIC" },
    { email: "cedric@fabios-mechbox.ch", name: "Cedric Holenstein",jobTitle: "Automobil-Mechatroniker",       role: "MECHANIC" },
    { email: "marco@fabios-mechbox.ch",  name: "Marco Eichmann",   jobTitle: "Automobil-Mechatroniker",       role: "MECHANIC" },
    { email: "elijah@fabios-mechbox.ch", name: "Elijah Jäger",     jobTitle: "Automobil-Fachmann Lernender",  role: "MECHANIC" },
    { email: "roger@fabios-mechbox.ch",  name: "Roger Willi",      jobTitle: "Automobil-Fachmann Lernender",  role: "MECHANIC" },
    { email: "besim@fabios-mechbox.ch",  name: "Besim Sherifi",    jobTitle: "Reifenpraktiker",               role: "MECHANIC" },
  ] as const;
  for (const t of team) {
    await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name, jobTitle: t.jobTitle, role: t.role },
      create: { ...t, passwordHash: hash },
    });
  }
  console.log(`✓ Team: ${team.length} Logins (Passwort ${PW})`);

  // ── Ressourcen: Bühnen + Personen mit Qualifikation ─────────────────────────
  const resources = [
    { name: "Hebebühne 1",     type: "LIFT"     as const, skillLevel: 0 },
    { name: "Hebebühne 2",     type: "LIFT"     as const, skillLevel: 0 },
    { name: "Hebebühne 3",     type: "LIFT"     as const, skillLevel: 0 },
    { name: "Jason Pagnin",    type: "MECHANIC" as const, skillLevel: 3, jobTitle: "Automobil-Diagnostiker" },
    { name: "Cedric Holenstein", type: "MECHANIC" as const, skillLevel: 2, jobTitle: "Automobil-Mechatroniker" },
    { name: "Marco Eichmann",  type: "MECHANIC" as const, skillLevel: 2, jobTitle: "Automobil-Mechatroniker" },
    { name: "Elijah Jäger",    type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Roger Willi",     type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Besim Sherifi",   type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Reifenpraktiker" },
  ];
  for (const r of resources) {
    const existing = await prisma.resource.findFirst({ where: { name: r.name } });
    if (existing) await prisma.resource.update({ where: { id: existing.id }, data: r });
    else await prisma.resource.create({ data: r });
  }
  // Alte generische Seed-Ressourcen deaktivieren
  for (const old of ["Mechaniker 1", "Mechaniker 2"]) {
    await prisma.resource.updateMany({ where: { name: old }, data: { active: false } });
  }
  const res = Object.fromEntries((await prisma.resource.findMany({ where: { active: true } })).map((r) => [r.name, r.id]));
  console.log(`✓ Ressourcen: ${Object.keys(res).length} aktiv`);

  // ── 20 Kunden mit Fahrzeugen (Region Schaffhausen) ─────────────────────────
  const kunden: Array<{
    type: "PRIVATE" | "COMPANY" | "FLEET"; firstName?: string; lastName?: string; company?: string;
    email: string; phone: string; street: string; zip: string; city: string; notes?: string;
    marketing?: string; // Quelle der E-Mail-Einwilligung
    vehicles: Array<{ licensePlate: string; brand: string; model: string; year: number; mileage: number; fuel?: string; vin?: string }>;
  }> = [
    { type: "PRIVATE", firstName: "Werner", lastName: "Meier", email: "werner.meier@bluewin.ch", phone: "+41 52 624 31 87", street: "Rosengartenstrasse 12", zip: "8200", city: "Schaffhausen", marketing: "Formular in der Annahme",
      vehicles: [{ licensePlate: "SH 284103", brand: "Volkswagen", model: "Golf 1.4 TSI", year: 2015, mileage: 128400, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Claudia", lastName: "Schmid", email: "claudia.schmid@gmail.com", phone: "+41 79 411 58 22", street: "Wiesenstrasse 3", zip: "8212", city: "Neuhausen am Rheinfall", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 301872", brand: "Toyota", model: "Yaris 1.5", year: 2018, mileage: 76300, fuel: "Benzin Hybrid" }] },
    { type: "COMPANY", company: "Elektro Brunner AG", email: "info@elektrobrunner.ch", phone: "+41 52 625 40 10", street: "Ebnatstrasse 88", zip: "8203", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 195422", brand: "Opel", model: "Vivaro 2.0 CDTI", year: 2019, mileage: 142800, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Beat", lastName: "Huber", email: "beat.huber@gmx.ch", phone: "+41 76 322 90 14", street: "Dorfstrasse 27", zip: "8222", city: "Beringen",
      vehicles: [{ licensePlate: "SH 248930", brand: "BMW", model: "320d Touring", year: 2016, mileage: 156200, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Miriam", lastName: "Keller", email: "miriam.keller@outlook.com", phone: "+41 78 715 63 40", street: "Laufenstrasse 9", zip: "8245", city: "Feuerthalen",
      vehicles: [{ licensePlate: "SH 322145", brand: "Skoda", model: "Octavia 1.5 TSI", year: 2019, mileage: 98700, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Thomas", lastName: "Winzeler", email: "t.winzeler@bluewin.ch", phone: "+41 52 641 22 76", street: "Herblingertalstrasse 51", zip: "8204", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 187365", brand: "Audi", model: "A4 Avant 2.0 TDI", year: 2014, mileage: 189500, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Gabriela", lastName: "Suter", email: "gabriela.suter@gmail.com", phone: "+41 79 684 27 31", street: "Bahnhofstrasse 14", zip: "8249", city: "Thayngen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 345012", brand: "Peugeot", model: "208 1.2", year: 2020, mileage: 61400, fuel: "Benzin" }] },
    { type: "FLEET", company: "Top-Clean Gebäudeservice GmbH", email: "einsatz@top-clean.ch", phone: "+41 52 672 55 80", street: "Industriering 6", zip: "8207", city: "Schaffhausen", notes: "Flottenvertrag: 2 Fahrzeuge, Service alle 15'000 km",
      vehicles: [
        { licensePlate: "SH 310284", brand: "Volkswagen", model: "Caddy 2.0 TDI", year: 2020, mileage: 121000, fuel: "Diesel" },
        { licensePlate: "SH 318460", brand: "Ford", model: "Transit Custom", year: 2021, mileage: 143500, fuel: "Diesel" },
      ] },
    { type: "PRIVATE", firstName: "Daniel", lastName: "Vontobel", email: "daniel.vontobel@gmx.ch", phone: "+41 79 300 18 59", street: "Vordergasse 118", zip: "8200", city: "Schaffhausen", marketing: "Mündlich bei Abholung, notiert von A. Schwendener",
      vehicles: [{ licensePlate: "SH 263891", brand: "Mercedes-Benz", model: "A 180", year: 2017, mileage: 87900, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Andrea", lastName: "Moser", email: "andrea.moser@bluewin.ch", phone: "+41 77 423 86 07", street: "Dorfstrasse 5", zip: "8232", city: "Merishausen",
      vehicles: [{ licensePlate: "SH 201574", brand: "Renault", model: "Clio IV 0.9 TCe", year: 2015, mileage: 134600, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Peter", lastName: "Bannwart", email: "p.bannwart@gmx.ch", phone: "+41 52 643 17 92", street: "Kirchweg 8", zip: "8213", city: "Neunkirch",
      vehicles: [{ licensePlate: "SH 174092", brand: "Volvo", model: "V40 D2", year: 2013, mileage: 201300, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Sarah", lastName: "Fässler", email: "sarah.faessler@gmail.com", phone: "+41 78 918 45 23", street: "Breitenaustrasse 33", zip: "8208", city: "Schaffhausen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 339671", brand: "Mazda", model: "CX-5 2.0", year: 2021, mileage: 54800, fuel: "Benzin" }] },
    { type: "COMPANY", company: "Sanitär Frei + Partner AG", email: "admin@sanitaer-frei.ch", phone: "+41 52 630 77 21", street: "Mühlestrasse 41", zip: "8205", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 230718", brand: "Fiat", model: "Ducato 2.3 MJ", year: 2018, mileage: 168900, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Michael", lastName: "Baumann", email: "michael.baumann@outlook.com", phone: "+41 79 542 66 18", street: "Rheinfallstrasse 120", zip: "8212", city: "Neuhausen am Rheinfall", marketing: "Formular in der Annahme",
      vehicles: [{ licensePlate: "SH 296530", brand: "Hyundai", model: "i20 1.2", year: 2018, mileage: 82400, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Jasmin", lastName: "Ruf", email: "jasmin.ruf@gmail.com", phone: "+41 76 512 09 84", street: "Bergstrasse 19", zip: "8215", city: "Hallau",
      vehicles: [{ licensePlate: "SH 315842", brand: "Citroën", model: "C3 1.2", year: 2019, mileage: 73100, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Martin", lastName: "Stamm", email: "martin.stamm@bluewin.ch", phone: "+41 52 698 34 65", street: "Weingartenstrasse 2", zip: "8263", city: "Buchberg",
      vehicles: [{ licensePlate: "SH 254176", brand: "Nissan", model: "Qashqai 1.6 dCi", year: 2017, mileage: 149700, fuel: "Diesel" }] },
    { type: "FLEET", company: "Kägi Transporte KG", email: "transport@kaegi-transporte.ch", phone: "+41 52 625 98 47", street: "Jungfraustrasse 4", zip: "8200", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 228940", brand: "Opel", model: "Combo 1.6 CDTI", year: 2019, mileage: 155200, fuel: "Diesel" }] },
    { type: "PRIVATE", firstName: "Ruth", lastName: "Ziegler", email: "ruth.ziegler@gmx.ch", phone: "+41 77 871 26 30", street: "Seestrasse 44", zip: "8260", city: "Stein am Rhein",
      vehicles: [{ licensePlate: "SH 219873", brand: "Suzuki", model: "Swift 1.2", year: 2016, mileage: 96500, fuel: "Benzin" }] },
    { type: "PRIVATE", firstName: "Kevin", lastName: "Oertle", email: "kevin.oertle@gmail.com", phone: "+41 79 127 84 56", street: "St. Anna-Strasse 15", zip: "8200", city: "Schaffhausen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 351208", brand: "Tesla", model: "Model 3 LR", year: 2022, mileage: 38900, fuel: "Elektrisch" }] },
    { type: "PRIVATE", firstName: "Brigitte", lastName: "Lehmann", email: "brigitte.lehmann@bluewin.ch", phone: "+41 52 681 42 19", street: "Im Tal 7", zip: "8233", city: "Beggingen",
      vehicles: [{ licensePlate: "SH 163527", brand: "Fiat", model: "Panda 0.9", year: 2012, mileage: 176800, fuel: "Benzin" }] },
  ];

  const vehiclesByPlate = new Map<string, { id: string; customerId: string }>();
  for (const k of kunden) {
    const exists = await prisma.customer.findFirst({ where: { email: k.email } });
    if (exists) {
      for (const v of await prisma.vehicle.findMany({ where: { customerId: exists.id } })) vehiclesByPlate.set(v.licensePlate, { id: v.id, customerId: exists.id });
      continue;
    }
    const created = await prisma.customer.create({
      data: {
        type: k.type, firstName: k.firstName, lastName: k.lastName, company: k.company,
        email: k.email, phone: k.phone, street: k.street, zip: k.zip, city: k.city, notes: k.notes,
        ...(k.marketing
          ? { consents: { create: { type: "EMAIL_MARKETING", granted: true, grantedAt: new Date("2026-09-14"), source: k.marketing } } }
          : {}),
        vehicles: { create: k.vehicles.map((v) => ({ ...v, vin: v.vin ?? null })) },
      },
      include: { vehicles: true },
    });
    for (const v of created.vehicles) vehiclesByPlate.set(v.licensePlate, { id: v.id, customerId: created.id });
  }
  console.log(`✓ Kunden: ${kunden.length} angelegt/gefunden, ${vehiclesByPlate.size} Fahrzeuge`);

  const veh = (plate: string) => vehiclesByPlate.get(plate)!;

  // ── Werkstattplan: letzte Woche (erledigt) + aktuelle Woche ─────────────────
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // Montag der aktuellen Woche
  monday.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, time: string) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + dayOffset);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const slot = (dayOffset: number, from: string, to: string) => ({ start: at(dayOffset, from), end: at(dayOffset, to) });

  type Appt = { plate: string; resource: string; reason: string; requiredSkill: number; status: "DONE" | "CONFIRMED" | "IN_PROGRESS" | "REQUESTED" | "CANCELLED"; from: string; to: string; day: number };
  const termine: Appt[] = [
    // Letzte Woche — erledigt
    { plate: "SH 284103", resource: "Hebebühne 1",    reason: "Bremsen vorne + hinten",            requiredSkill: 2, status: "DONE",      day: 0, from: "08:00", to: "10:00" },
    { plate: "SH 301872", resource: "Jason Pagnin",   reason: "Diagnose Motorleuchte",             requiredSkill: 3, status: "DONE",      day: 1, from: "08:00", to: "09:00" },
    { plate: "SH 322145", resource: "Hebebühne 2",    reason: "Service mit Ölwechsel",             requiredSkill: 1, status: "DONE",      day: 2, from: "10:30", to: "12:00" },
    { plate: "SH 187365", resource: "Hebebühne 1",    reason: "Winterreifen montieren + wuchten",  requiredSkill: 1, status: "DONE",      day: 3, from: "13:30", to: "15:00" },
    { plate: "SH 248930", resource: "Jason Pagnin",   reason: "Fehlersuche Startprobleme",         requiredSkill: 3, status: "DONE",      day: 4, from: "08:00", to: "08:45" },
    { plate: "SH 230718", resource: "Hebebühne 2",    reason: "Kupplung prüfen + Bremsdienst",     requiredSkill: 2, status: "DONE",      day: 4, from: "14:00", to: "15:30" },
    // Aktuelle Woche — kommende Termine
    { plate: "SH 284103", resource: "Hebebühne 1",    reason: "Service gross + Bremsflüssigkeit",  requiredSkill: 2, status: "CONFIRMED", day: 7,  from: "07:30", to: "09:00" },
    { plate: "SH 339671", resource: "Jason Pagnin",   reason: "Diagnose Airbag-Warnleuchte",       requiredSkill: 3, status: "CONFIRMED", day: 7,  from: "09:00", to: "10:00" },
    { plate: "SH 315842", resource: "Besim Sherifi",  reason: "Winterreifen montieren",            requiredSkill: 1, status: "CONFIRMED", day: 7,  from: "13:30", to: "15:00" },
    { plate: "SH 187365", resource: "Hebebühne 1",    reason: "Zahnriemen + Wasserpumpe",          requiredSkill: 2, status: "CONFIRMED", day: 8,  from: "08:00", to: "11:30" },
    { plate: "SH 296530", resource: "Roger Willi",    reason: "MFK-Vorbereitung",                  requiredSkill: 1, status: "CONFIRMED", day: 8,  from: "10:00", to: "11:00" },
    { plate: "SH 310284", resource: "Hebebühne 2",    reason: "Inspektion Flottenfahrzeug",        requiredSkill: 2, status: "CONFIRMED", day: 8,  from: "14:00", to: "15:30" },
    { plate: "SH 248930", resource: "—",              reason: "Ölwechsel — von Kunde abgesagt",    requiredSkill: 1, status: "CANCELLED", day: 8,  from: "16:00", to: "16:30" },
    { plate: "SH 254176", resource: "Cedric Holenstein", reason: "Elektrik: Fensterheber hinten",  requiredSkill: 2, status: "CONFIRMED", day: 9,  from: "08:00", to: "09:30" },
    { plate: "SH 174092", resource: "Hebebühne 1",    reason: "Auspuffanlage ersetzen",            requiredSkill: 2, status: "CONFIRMED", day: 9,  from: "10:30", to: "12:00" },
    { plate: "SH 195422", resource: "Besim Sherifi",  reason: "Reifenwechsel Flottenwagen",        requiredSkill: 1, status: "CONFIRMED", day: 9,  from: "15:00", to: "16:00" },
    { plate: "SH 263891", resource: "Hebebühne 2",    reason: "Stossdämpfer hinten",               requiredSkill: 2, status: "CONFIRMED", day: 10, from: "08:00", to: "09:30" },
    { plate: "SH 351208", resource: "Jason Pagnin",   reason: "Diagnose Ladeproblem",              requiredSkill: 3, status: "CONFIRMED", day: 10, from: "11:00", to: "11:45" },
    { plate: "SH 163527", resource: "Elijah Jäger",   reason: "Service klein",                     requiredSkill: 1, status: "CONFIRMED", day: 10, from: "14:00", to: "15:00" },
    { plate: "SH 228940", resource: "Hebebühne 1",    reason: "Bremsen hinten + Achsvermessung",   requiredSkill: 2, status: "CONFIRMED", day: 11, from: "08:00", to: "09:30" },
    { plate: "SH 219873", resource: "Marco Eichmann", reason: "Klimaservice",                      requiredSkill: 2, status: "CONFIRMED", day: 11, from: "13:30", to: "14:30" },
    { plate: "SH 201574", resource: "—",              reason: "Terminanfrage: Reifen einlagern (Online-Schalter)", requiredSkill: 0, status: "REQUESTED", day: 11, from: "16:00", to: "16:30" },
  ];

  let angelegt = 0;
  for (const t of termine) {
    const { id: vehicleId, customerId } = veh(t.plate);
    const dup = await prisma.appointment.findFirst({ where: { vehicleId, start: at(t.day, t.from) } });
    if (dup) continue;
    const { start, end } = slot(t.day, t.from, t.to);
    await prisma.appointment.create({
      data: {
        customerId, vehicleId,
        resourceId: t.resource !== "—" ? res[t.resource] : undefined,
        requiredSkill: t.requiredSkill,
        status: t.status,
        reason: t.reason,
        start, end,
      },
    });
    angelegt++;
  }
  console.log(`✓ Werkstattplan: ${angelegt} Termine angelegt (letzte + aktuelle Woche)`);

  console.log("\nDemo-Logins (Passwort für alle: mechbox2026):");
  for (const t of team) console.log(`  ${t.email} — ${t.name} (${t.jobTitle})`);
  console.log("  chef@werkstatt.ch / changeme — bestehender Login (unverändert)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * Demo-Daten für Fabios Mech_Box GmbH (fabios-mechbox.ch) — NUR für die lokale Dev-DB!
 *   npm run db:seed:demo     (in apps/api)
 * Idempotent: existierende E-Mails/Kennzeichen/Termine werden übersprungen.
 * Team real gemäss fabios-mechbox.ch/team (Stand 11/2026). Szenario: November =
 * Reifenwechsel-Hochsaison, voller Betrieb auf 4 Hebebühnen, Leihwagen-Läufe,
 * Reifenhotel-Einlagerungen.
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
    { email: "jorge@fabios-mechbox.ch",   name: "Jorge Fernandez",   jobTitle: "Werkstattchef",                role: "ADMIN" },
    { email: "andy@fabios-mechbox.ch",    name: "Andy Schwendener",  jobTitle: "Kundendienst (Annahme)",       role: "STAFF" },
    { email: "ramona@fabios-mechbox.ch",  name: "Ramona Conti",      jobTitle: "Buchhaltung & Administration", role: "STAFF" },
    { email: "michael@fabios-mechbox.ch", name: "Michael Jauch",     jobTitle: "Kundendienst",                 role: "STAFF" },
    { email: "lucien@fabios-mechbox.ch",  name: "Lucien Stettler",   jobTitle: "Kundendienst",                 role: "STAFF" },
    { email: "jason@fabios-mechbox.ch",   name: "Jason Pagnin",      jobTitle: "Automobil-Diagnostiker",       role: "MECHANIC" },
    { email: "cedric@fabios-mechbox.ch",  name: "Cedric Holenstein", jobTitle: "Automobil-Mechatroniker",      role: "MECHANIC" },
    { email: "marco@fabios-mechbox.ch",   name: "Marco Eichmann",    jobTitle: "Automobil-Mechatroniker",      role: "MECHANIC" },
    { email: "gianni@fabios-mechbox.ch",  name: "Gianni Verrilli",   jobTitle: "Automechaniker",               role: "MECHANIC" },
    { email: "marcel@fabios-mechbox.ch",  name: "Marcel Steinemann", jobTitle: "Automechaniker",               role: "MECHANIC" },
    { email: "elijah@fabios-mechbox.ch",  name: "Elijah Jäger",      jobTitle: "Automobil-Fachmann Lernender", role: "MECHANIC" },
    { email: "roger@fabios-mechbox.ch",   name: "Roger Willi",       jobTitle: "Automobil-Fachmann Lernender", role: "MECHANIC" },
    { email: "besim@fabios-mechbox.ch",   name: "Besim Sherifi",     jobTitle: "Reifenpraktiker",              role: "MECHANIC" },
  ] as const;
  for (const t of team) {
    await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name, jobTitle: t.jobTitle, role: t.role },
      create: { ...t, passwordHash: hash },
    });
  }
  console.log(`✓ Team: ${team.length} Logins (Passwort ${PW})`);

  // ── Ressourcen: 4 Bühnen + alle Werkmänner (inkl. Lernende) ─────────────────
  const resources = [
    { name: "Hebebühne 1", type: "LIFT" as const, skillLevel: 0 },
    { name: "Hebebühne 2", type: "LIFT" as const, skillLevel: 0 },
    { name: "Hebebühne 3", type: "LIFT" as const, skillLevel: 0 },
    { name: "Hebebühne 4", type: "LIFT" as const, skillLevel: 0 },
    { name: "Jason Pagnin",      type: "MECHANIC" as const, skillLevel: 3, jobTitle: "Automobil-Diagnostiker" },
    { name: "Cedric Holenstein", type: "MECHANIC" as const, skillLevel: 2, jobTitle: "Automobil-Mechatroniker" },
    { name: "Marco Eichmann",    type: "MECHANIC" as const, skillLevel: 2, jobTitle: "Automobil-Mechatroniker" },
    { name: "Gianni Verrilli",   type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automechaniker" },
    { name: "Marcel Steinemann", type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automechaniker" },
    { name: "Besim Sherifi",     type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Reifenpraktiker" },
    { name: "Elijah Jäger",      type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Roger Willi",       type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Elvedin Memedoski", type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Florin Duttlinger", type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Fachmann Lernender" },
    { name: "Stefano Schober",   type: "MECHANIC" as const, skillLevel: 1, jobTitle: "Automobil-Assistent Lernender" },
  ];
  for (const r of resources) {
    const existing = await prisma.resource.findFirst({ where: { name: r.name } });
    if (existing) await prisma.resource.update({ where: { id: existing.id }, data: r });
    else await prisma.resource.create({ data: r });
  }
  for (const old of ["Mechaniker 1", "Mechaniker 2"]) {
    await prisma.resource.updateMany({ where: { name: old }, data: { active: false } });
  }
  const res = Object.fromEntries((await prisma.resource.findMany({ where: { active: true } })).map((r) => [r.name, r.id]));
  console.log(`✓ Ressourcen: ${Object.keys(res).length} aktiv (4 Bühnen + Werkstatt-Team)`);

  // ── 20 Kunden mit Fahrzeugen (Region Schaffhausen) ─────────────────────────
  const kunden: Array<{
    type: "PRIVATE" | "COMPANY" | "FLEET"; firstName?: string; lastName?: string; company?: string;
    email: string; phone: string; street: string; zip: string; city: string; notes?: string;
    marketing?: string;
    vehicles: Array<{ licensePlate: string; brand: string; model: string; year: number; mileage: number; fuel?: string; inches?: number }>;
  }> = [
    { type: "PRIVATE", firstName: "Werner", lastName: "Meier", email: "werner.meier@bluewin.ch", phone: "+41 52 624 31 87", street: "Rosengartenstrasse 12", zip: "8200", city: "Schaffhausen", marketing: "Formular in der Annahme",
      vehicles: [{ licensePlate: "SH 284103", brand: "Volkswagen", model: "Golf 1.4 TSI", year: 2015, mileage: 128400, fuel: "Benzin", inches: 16 }] },
    { type: "PRIVATE", firstName: "Claudia", lastName: "Schmid", email: "claudia.schmid@gmail.com", phone: "+41 79 411 58 22", street: "Wiesenstrasse 3", zip: "8212", city: "Neuhausen am Rheinfall", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 301872", brand: "Toyota", model: "Yaris 1.5", year: 2018, mileage: 76300, fuel: "Benzin Hybrid", inches: 15 }] },
    { type: "COMPANY", company: "Elektro Brunner AG", email: "info@elektrobrunner.ch", phone: "+41 52 625 40 10", street: "Ebnatstrasse 88", zip: "8203", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 195422", brand: "Opel", model: "Vivaro 2.0 CDTI", year: 2019, mileage: 142800, fuel: "Diesel", inches: 17 }] },
    { type: "PRIVATE", firstName: "Beat", lastName: "Huber", email: "beat.huber@gmx.ch", phone: "+41 76 322 90 14", street: "Dorfstrasse 27", zip: "8222", city: "Beringen",
      vehicles: [{ licensePlate: "SH 248930", brand: "BMW", model: "320d Touring", year: 2016, mileage: 156200, fuel: "Diesel", inches: 17 }] },
    { type: "PRIVATE", firstName: "Miriam", lastName: "Keller", email: "miriam.keller@outlook.com", phone: "+41 78 715 63 40", street: "Laufenstrasse 9", zip: "8245", city: "Feuerthalen",
      vehicles: [{ licensePlate: "SH 322145", brand: "Skoda", model: "Octavia 1.5 TSI", year: 2019, mileage: 98700, fuel: "Benzin", inches: 16 }] },
    { type: "PRIVATE", firstName: "Thomas", lastName: "Winzeler", email: "t.winzeler@bluewin.ch", phone: "+41 52 641 22 76", street: "Herblingertalstrasse 51", zip: "8204", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 187365", brand: "Audi", model: "A4 Avant 2.0 TDI", year: 2014, mileage: 189500, fuel: "Diesel", inches: 17 }] },
    { type: "PRIVATE", firstName: "Gabriela", lastName: "Suter", email: "gabriela.suter@gmail.com", phone: "+41 79 684 27 31", street: "Bahnhofstrasse 14", zip: "8249", city: "Thayngen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 345012", brand: "Peugeot", model: "208 1.2", year: 2020, mileage: 61400, fuel: "Benzin", inches: 16 }] },
    { type: "FLEET", company: "Top-Clean Gebäudeservice GmbH", email: "einsatz@top-clean.ch", phone: "+41 52 672 55 80", street: "Industriering 6", zip: "8207", city: "Schaffhausen", notes: "Flottenvertrag: 2 Fahrzeuge, Service alle 15'000 km",
      vehicles: [
        { licensePlate: "SH 310284", brand: "Volkswagen", model: "Caddy 2.0 TDI", year: 2020, mileage: 121000, fuel: "Diesel", inches: 16 },
        { licensePlate: "SH 318460", brand: "Ford", model: "Transit Custom", year: 2021, mileage: 143500, fuel: "Diesel", inches: 16 },
      ] },
    { type: "PRIVATE", firstName: "Daniel", lastName: "Vontobel", email: "daniel.vontobel@gmx.ch", phone: "+41 79 300 18 59", street: "Vordergasse 118", zip: "8200", city: "Schaffhausen", marketing: "Mündlich bei Abholung, notiert von A. Schwendener",
      vehicles: [{ licensePlate: "SH 263891", brand: "Mercedes-Benz", model: "A 180", year: 2017, mileage: 87900, fuel: "Benzin", inches: 16 }] },
    { type: "PRIVATE", firstName: "Andrea", lastName: "Moser", email: "andrea.moser@bluewin.ch", phone: "+41 77 423 86 07", street: "Dorfstrasse 5", zip: "8232", city: "Merishausen",
      vehicles: [{ licensePlate: "SH 201574", brand: "Renault", model: "Clio IV 0.9 TCe", year: 2015, mileage: 134600, fuel: "Benzin", inches: 15 }] },
    { type: "PRIVATE", firstName: "Peter", lastName: "Bannwart", email: "p.bannwart@gmx.ch", phone: "+41 52 643 17 92", street: "Kirchweg 8", zip: "8213", city: "Neunkirch",
      vehicles: [{ licensePlate: "SH 174092", brand: "Volvo", model: "V40 D2", year: 2013, mileage: 201300, fuel: "Diesel", inches: 16 }] },
    { type: "PRIVATE", firstName: "Sarah", lastName: "Fässler", email: "sarah.faessler@gmail.com", phone: "+41 78 918 45 23", street: "Breitenaustrasse 33", zip: "8208", city: "Schaffhausen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 339671", brand: "Mazda", model: "CX-5 2.0", year: 2021, mileage: 54800, fuel: "Benzin", inches: 17 }] },
    { type: "COMPANY", company: "Sanitär Frei + Partner AG", email: "admin@sanitaer-frei.ch", phone: "+41 52 630 77 21", street: "Mühlestrasse 41", zip: "8205", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 230718", brand: "Fiat", model: "Ducato 2.3 MJ", year: 2018, mileage: 168900, fuel: "Diesel", inches: 15 }] },
    { type: "PRIVATE", firstName: "Michael", lastName: "Baumann", email: "michael.baumann@outlook.com", phone: "+41 79 542 66 18", street: "Rheinfallstrasse 120", zip: "8212", city: "Neuhausen am Rheinfall", marketing: "Formular in der Annahme",
      vehicles: [{ licensePlate: "SH 296530", brand: "Hyundai", model: "i20 1.2", year: 2018, mileage: 82400, fuel: "Benzin", inches: 15 }] },
    { type: "PRIVATE", firstName: "Jasmin", lastName: "Ruf", email: "jasmin.ruf@gmail.com", phone: "+41 76 512 09 84", street: "Bergstrasse 19", zip: "8215", city: "Hallau",
      vehicles: [{ licensePlate: "SH 315842", brand: "Citroën", model: "C3 1.2", year: 2019, mileage: 73100, fuel: "Benzin", inches: 16 }] },
    { type: "PRIVATE", firstName: "Martin", lastName: "Stamm", email: "martin.stamm@bluewin.ch", phone: "+41 52 698 34 65", street: "Weingartenstrasse 2", zip: "8263", city: "Buchberg",
      vehicles: [{ licensePlate: "SH 254176", brand: "Nissan", model: "Qashqai 1.6 dCi", year: 2017, mileage: 149700, fuel: "Diesel", inches: 17 }] },
    { type: "FLEET", company: "Kägi Transporte KG", email: "transport@kaegi-transporte.ch", phone: "+41 52 625 98 47", street: "Jungfraustrasse 4", zip: "8200", city: "Schaffhausen",
      vehicles: [{ licensePlate: "SH 228940", brand: "Opel", model: "Combo 1.6 CDTI", year: 2019, mileage: 155200, fuel: "Diesel", inches: 16 }] },
    { type: "PRIVATE", firstName: "Ruth", lastName: "Ziegler", email: "ruth.ziegler@gmx.ch", phone: "+41 77 871 26 30", street: "Seestrasse 44", zip: "8260", city: "Stein am Rhein",
      vehicles: [{ licensePlate: "SH 219873", brand: "Suzuki", model: "Swift 1.2", year: 2016, mileage: 96500, fuel: "Benzin", inches: 15 }] },
    { type: "PRIVATE", firstName: "Kevin", lastName: "Oertle", email: "kevin.oertle@gmail.com", phone: "+41 79 127 84 56", street: "St. Anna-Strasse 15", zip: "8200", city: "Schaffhausen", marketing: "Newsletter-Anmeldung auf fabios-mechbox.ch",
      vehicles: [{ licensePlate: "SH 351208", brand: "Tesla", model: "Model 3 LR", year: 2022, mileage: 38900, fuel: "Elektrisch", inches: 18 }] },
    { type: "PRIVATE", firstName: "Brigitte", lastName: "Lehmann", email: "brigitte.lehmann@bluewin.ch", phone: "+41 52 681 42 19", street: "Im Tal 7", zip: "8233", city: "Beggingen",
      vehicles: [{ licensePlate: "SH 163527", brand: "Fiat", model: "Panda 0.9", year: 2012, mileage: 176800, fuel: "Benzin", inches: 14 }] },
  ];

  const vehiclesByPlate = new Map<string, { id: string; customerId: string; inches?: number }>();
  for (const k of kunden) {
    let created = await prisma.customer.findFirst({
      where: { email: k.email },
      include: { vehicles: true },
    });
    if (!created) {
      created = await prisma.customer.create({
        data: {
          type: k.type, firstName: k.firstName, lastName: k.lastName, company: k.company,
          email: k.email, phone: k.phone, street: k.street, zip: k.zip, city: k.city, notes: k.notes,
          ...(k.marketing
            ? { consents: { create: { type: "EMAIL_MARKETING", granted: true, grantedAt: new Date("2026-09-14"), source: k.marketing } } }
            : {}),
          vehicles: { create: k.vehicles.map(({ inches: _ignored, ...v }) => ({ ...v, vin: null })) },
        },
        include: { vehicles: true },
      });
    }
    for (const v of created.vehicles) {
      const meta = k.vehicles.find((x) => x.licensePlate === v.licensePlate);
      vehiclesByPlate.set(v.licensePlate, { id: v.id, customerId: created.id, inches: meta?.inches });
    }
  }
  console.log(`✓ Kunden: ${kunden.length} angelegt/gefunden, ${vehiclesByPlate.size} Fahrzeuge`);

  const veh = (plate: string) => vehiclesByPlate.get(plate)!;

  // ── Leihwagen-Flotte + Ausleihen ────────────────────────────────────────────
  const flotte = [
    { plate: "SH 100125", brand: "Volkswagen", model: "up! 1.0",  odo: 92400 },
    { plate: "SH 100238", brand: "Opel",       model: "Corsa 1.4", odo: 88100 },
    { plate: "SH 100351", brand: "Skoda",      model: "Fabia 1.0", odo: 74900 },
    { plate: "SH 100464", brand: "Toyota",     model: "Aygo 1.0",  odo: 103600 },
  ];
  for (const f of flotte) {
    await prisma.loanerVehicle.upsert({
      where: { plate: f.plate },
      update: { brand: f.brand, model: f.model, odometer: f.odo },
      create: { plate: f.plate, brand: f.brand, model: f.model, odometer: f.odo, dailyRate: 45 },
    });
  }
  const loaner = Object.fromEntries((await prisma.loanerVehicle.findMany()).map((l) => [l.plate, l.id]));
  console.log(`✓ Leihwagen-Flotte: ${flotte.length} Fahrzeuge`);

  // ── Reifenhotel: November = Sommer-Räder kommen rein ────────────────────────
  const hotelEinlagerungen: Array<{ plate: string; season: "SUMMER" | "WINTER" | "ALLSEASON"; storedAt: Date; retrievedAt?: Date; note?: string }> = [
    // Diese Woche eingelagert (Sommer-Räder nach dem Wechsel auf Winter)
    { plate: "SH 284103", season: "SUMMER", storedAt: new Date("2026-11-02T10:00:00"), note: "Michelin Primacy 4, 8/10 mm" },
    { plate: "SH 301872", season: "SUMMER", storedAt: new Date("2026-11-03T09:30:00") },
    { plate: "SH 322145", season: "SUMMER", storedAt: new Date("2026-11-03T11:00:00") },
    { plate: "SH 345012", season: "SUMMER", storedAt: new Date("2026-11-04T08:30:00") },
    { plate: "SH 263891", season: "SUMMER", storedAt: new Date("2026-11-04T10:15:00"), note: "Kunde holt Sommer-Räder im Frühling wieder ab" },
    { plate: "SH 296530", season: "SUMMER", storedAt: new Date("2026-11-05T09:00:00") },
    { plate: "SH 315842", season: "SUMMER", storedAt: new Date("2026-11-05T14:00:00") },
    { plate: "SH 351208", season: "SUMMER", storedAt: new Date("2026-11-06T11:00:00"), note: "18\", Tesla-Radkappen im Beutel dabei" },
    { plate: "SH 201574", season: "SUMMER", storedAt: new Date("2026-11-06T15:30:00") },
    { plate: "SH 219873", season: "SUMMER", storedAt: new Date("2026-11-07T10:00:00") },
    // Im Frühling eingelagerte Winter-Sätze — diese Woche geholt (jetzt montiert)
    { plate: "SH 248930", season: "WINTER", storedAt: new Date("2026-04-08T09:00:00"), retrievedAt: new Date("2026-11-03T08:00:00") },
    { plate: "SH 187365", season: "WINTER", storedAt: new Date("2026-04-10T13:00:00"), retrievedAt: new Date("2026-11-06T14:00:00") },
    // Noch im Hotel: Winter-Satz eines Stammkunden (reist viel)
    { plate: "SH 254176", season: "WINTER", storedAt: new Date("2026-04-12T10:00:00"), note: "Kunde bis Ende November im Ausland" },
  ];
  const usedSlots = new Set((await prisma.tyreSet.findMany({ select: { slotCode: true } })).map((t) => t.slotCode));
  let slotNum = 1;
  const nextSlot = () => {
    let code = `R1-${String(slotNum).padStart(2, "0")}`;
    while (usedSlots.has(code)) {
      slotNum++;
      code = `R1-${String(slotNum).padStart(2, "0")}`;
    }
    usedSlots.add(code);
    return code;
  };
  for (const e of hotelEinlagerungen) {
    const v = veh(e.plate);
    const exists = await prisma.tyreSet.findFirst({ where: { vehicleId: v.id, season: e.season, storedAt: e.storedAt } });
    if (exists) continue;
    await prisma.tyreSet.create({
      data: {
        customerId: v.customerId, vehicleId: v.id,
        slotCode: nextSlot(), season: e.season, inches: v.inches ?? null,
        storedAt: e.storedAt, retrievedAt: e.retrievedAt ?? null,
        seasonFee: 50, notes: e.note ?? null,
      },
    });
  }
  console.log(`✓ Reifenhotel: ${hotelEinlagerungen.length} Sätze (November-Einlagerungen + Frühling)`);

  // ── Leihwagen-Läufe: Kunden mit mehrtägigen Aufträgen ───────────────────────
  const leihen: Array<{ loaner: string; plate: string; from: string; to: string; returned?: string }> = [
    { loaner: "SH 100125", plate: "SH 187365", from: "2026-11-04T08:00", to: "2026-11-06T17:00" },                    // Zahnriemen A4
    { loaner: "SH 100238", plate: "SH 174092", from: "2026-11-05T08:00", to: "2026-11-06T17:00" },                    // Auspuff V40
    { loaner: "SH 100351", plate: "SH 263891", from: "2026-11-06T08:00", to: "2026-11-09T17:00" },                    // Stossdämpfer A 180
    { loaner: "SH 100464", plate: "SH 284103", from: "2026-11-02T08:00", to: "2026-11-02T17:00", returned: "2026-11-02T16:40" }, // Bremsen Golf (zurück)
    { loaner: "SH 100125", plate: "SH 318460", from: "2026-10-28T08:00", to: "2026-10-29T17:00", returned: "2026-10-29T16:20" }, // Transit-Service letzte Woche
  ];
  for (const l of leihen) {
    const v = veh(l.plate);
    const dup = await prisma.loan.findFirst({ where: { loanerId: loaner[l.loaner], outAt: new Date(l.from) } });
    if (dup) continue;
    await prisma.loan.create({
      data: {
        loanerId: loaner[l.loaner], customerId: v.customerId, vehicleId: v.id,
        status: l.returned ? "RETURNED" : "OPEN",
        outAt: new Date(l.from), dueAt: new Date(l.to), returnedAt: l.returned ? new Date(l.returned) : null,
        dailyRate: 45,
      },
    });
  }
  // Flottenstatus synchronisieren: Wagen mit offener Ausleihe = LOANED
  await prisma.loanerVehicle.updateMany({ data: { status: "AVAILABLE" } });
  const openLoanerIds = (await prisma.loan.findMany({ where: { status: "OPEN" }, select: { loanerId: true } })).map((l) => l.loanerId);
  if (openLoanerIds.length) await prisma.loanerVehicle.updateMany({ where: { id: { in: openLoanerIds } }, data: { status: "LOANED" } });
  console.log(`✓ Leihwagen: ${leihen.length} Läufe (${openLoanerIds.length} offen, Status sync)`);

  // ── Werkstattplan: volle Hochsaison-Tage ────────────────────────────────────
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, time: string) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + dayOffset);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Kompaktformat: [Tag, von, bis, Ressource, Kennzeichen, Grund, MinSkill, Status]
  type T = [number, string, string, string, string, string, number, "DONE" | "CONFIRMED" | "IN_PROGRESS" | "REQUESTED" | "CANCELLED"];
  const plan: T[] = [
    // ═══ AKTUELLE PLANERWOCHE Mo–Sa (erledigt — Hochsaison-Reifen + Normalbetrieb) ═══
    // Montag
    [0, "07:30", "09:30", "Hebebühne 1", "SH 284103", "Bremsen vorne + hinten", 2, "DONE"],
    [0, "07:30", "08:15", "Hebebühne 3", "SH 345012", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [0, "08:15", "09:00", "Hebebühne 3", "SH 301872", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [0, "09:00", "09:45", "Hebebühne 3", "SH 263891", "Räder wuchten + Einlagerung", 1, "DONE"],
    [0, "08:00", "09:00", "Jason Pagnin", "SH 301872", "Diagnose Motorleuchte", 3, "DONE"],
    [0, "10:00", "12:00", "Hebebühne 2", "SH 322145", "Service mit Ölwechsel", 1, "DONE"],
    [0, "13:15", "14:45", "Hebebühne 1", "SH 187365", "Winterreifen montieren (Hotel-Satz)", 1, "DONE"],
    [0, "13:30", "14:15", "Hebebühne 4", "SH 345012", "Winterreifen montieren", 1, "DONE"],
    [0, "14:15", "15:00", "Hebebühne 4", "SH 301872", "Winterreifen montieren", 1, "DONE"],
    [0, "15:00", "15:45", "Hebebühne 4", "SH 263891", "Winterreifen montieren", 1, "DONE"],
    [0, "15:30", "16:30", "Cedric Holenstein", "SH 195422", "Elektrik: Ladebuchse Prüflauf", 2, "DONE"],
    [0, "16:00", "17:00", "Marco Eichmann", "SH 310284", "Klimaanlage nachfüllen", 2, "DONE"],
    // Dienstag
    [1, "07:30", "09:00", "Hebebühne 1", "SH 248930", "Winterreifen (Hotel-Satz) + Sommer ins Hotel", 1, "DONE"],
    [1, "08:00", "08:45", "Jason Pagnin", "SH 248930", "Fehlersuche Startprobleme", 3, "DONE"],
    [1, "07:45", "08:30", "Hebebühne 3", "SH 339671", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [1, "08:30", "09:15", "Hebebühne 3", "SH 296530", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [1, "09:15", "10:00", "Hebebühne 3", "SH 163527", "Winterreifen montieren", 1, "DONE"],
    [1, "10:00", "11:30", "Hebebühne 2", "SH 318460", "Inspektion Flottenfahrzeug", 2, "DONE"],
    [1, "11:00", "11:45", "Besim Sherifi", "SH 195422", "Reifen-Offerte Flotte (Beratung)", 1, "DONE"],
    [1, "13:15", "15:30", "Hebebühne 1", "SH 187365", "Zahnriemen + Wasserpumpe (Tag 1)", 2, "DONE"],
    [1, "13:30", "14:15", "Hebebühne 4", "SH 339671", "Winterreifen montieren", 1, "DONE"],
    [1, "14:15", "15:00", "Hebebühne 4", "SH 296530", "Winterreifen montieren", 1, "DONE"],
    [1, "15:00", "15:45", "Hebebühne 4", "SH 163527", "Winterreifen montieren", 1, "DONE"],
    [1, "14:00", "15:00", "Marco Eichmann", "SH 254176", "Elektrik: Fensterheber hinten", 2, "DONE"],
    [1, "16:00", "16:45", "Gianni Verrilli", "SH 219873", "Achsvermessung nach Bordstein-Kontakt", 1, "DONE"],
    // Mittwoch
    [2, "07:30", "09:30", "Hebebühne 1", "SH 187365", "Zahnriemen + Wasserpumpe (Tag 2)", 2, "DONE"],
    [2, "07:45", "08:30", "Hebebühne 3", "SH 284103", "Winterreifen montieren (Hotel-Satz)", 1, "DONE"],
    [2, "08:30", "09:15", "Hebebühne 3", "SH 310284", "Winterreifen Flotte", 1, "DONE"],
    [2, "09:15", "10:00", "Hebebühne 3", "SH 318460", "Winterreifen Flotte", 1, "DONE"],
    [2, "10:30", "12:00", "Hebebühne 2", "SH 230718", "Kupplung prüfen + Bremsdienst", 2, "DONE"],
    [2, "10:30", "11:30", "Jason Pagnin", "SH 351208", "Diagnose Ladeproblem (Ladeport)", 3, "DONE"],
    [2, "13:15", "14:45", "Hebebühne 1", "SH 174092", "Auspuffanlage ersetzen", 2, "DONE"],
    [2, "13:30", "14:15", "Hebebühne 4", "SH 284103", "Räder nachziehen + Reinigung", 1, "DONE"],
    [2, "14:30", "15:15", "Hebebühne 4", "SH 228940", "Winterreifen montieren", 1, "DONE"],
    [2, "15:15", "16:00", "Hebebühne 4", "SH 201574", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [2, "15:30", "16:30", "Marcel Steinemann", "SH 322145", "Wischwasserheizung + Frontscheibe", 1, "DONE"],
    // Donnerstag
    [3, "07:30", "09:00", "Hebebühne 1", "SH 263891", "Stossdämpfer hinten (Leihwagen läuft)", 2, "DONE"],
    [3, "07:45", "08:30", "Hebebühne 3", "SH 315842", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [3, "08:30", "09:15", "Hebebühne 3", "SH 351208", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [3, "09:15", "10:00", "Hebebühne 3", "SH 219873", "Sommer→Winter + Einlagerung Hotel", 1, "DONE"],
    [3, "10:00", "11:00", "Jason Pagnin", "SH 339671", "Diagnose Airbag-Warnleuchte", 3, "DONE"],
    [3, "10:00", "11:30", "Hebebühne 2", "SH 296530", "MFK-Vorbereitung", 1, "DONE"],
    [3, "13:15", "14:00", "Hebebühne 1", "SH 163527", "Service klein", 1, "DONE"],
    [3, "13:30", "14:15", "Hebebühne 4", "SH 315842", "Winterreifen montieren", 1, "DONE"],
    [3, "14:15", "15:00", "Hebebühne 4", "SH 351208", "Winterreifen montieren (18 Zoll)", 1, "DONE"],
    [3, "15:00", "15:45", "Hebebühne 4", "SH 219873", "Winterreifen montieren", 1, "DONE"],
    [3, "14:00", "15:30", "Cedric Holenstein", "SH 254176", "Fehlersuche CAN-Bus", 3, "DONE"],
    [3, "16:00", "17:00", "Elijah Jäger", "SH 201574", "Räder waschen + Hotelplatz zuweisen", 1, "DONE"],
    // Freitag (kurzer Tag, bis 16:15)
    [4, "07:30", "08:15", "Hebebühne 3", "SH 195422", "Winterreifen Flotte", 1, "DONE"],
    [4, "07:30", "09:30", "Hebebühne 1", "SH 228940", "Bremsen hinten + Achsvermessung", 2, "DONE"],
    [4, "09:00", "10:00", "Hebebühne 2", "SH 322145", "Nachkontrolle Service", 1, "DONE"],
    [4, "09:30", "10:15", "Hebebühne 4", "SH 230718", "Reifendruck prüfen (Transporter)", 1, "DONE"],
    [4, "10:30", "11:15", "Jason Pagnin", "SH 339671", "Airbag-Steuergerät Rücksetzen", 3, "DONE"],
    [4, "13:15", "14:30", "Hebebühne 1", "SH 174092", "Nachkontrolle Auspuff", 2, "DONE"],
    [4, "13:30", "14:15", "Hebebühne 4", "SH 163527", "Winterreifen Ruhedruck prüfen", 1, "DONE"],
    [4, "14:30", "15:15", "Gianni Verrilli", "SH 345012", "Lichttest + Beleuchtung", 1, "DONE"],
    [4, "15:00", "15:45", "Hebebühne 2", "SH 351208", "Reifendruck-Sensor einlernen", 2, "DONE"],
    // Samstagvormittag (09:00–12:00)
    [5, "09:00", "09:45", "Hebebühne 3", "SH 345012", "Nachkontrolle Winterreifen", 1, "DONE"],
    [5, "09:45", "10:30", "Hebebühne 3", "SH 296530", "Reifen-Einlagerung nachholen", 1, "DONE"],

    // ═══ NÄCHSTE WOCHE (bestätigt — laufender Hochsaison-Betrieb) ═══
    // Montag
    [7, "07:30", "09:00", "Hebebühne 1", "SH 284103", "Service gross + Bremsflüssigkeit", 2, "CONFIRMED"],
    [7, "09:00", "10:00", "Jason Pagnin", "SH 339671", "Diagnose Airbag-Warnleuchte (Wiederholung)", 3, "CONFIRMED"],
    [7, "07:30", "08:15", "Hebebühne 3", "SH 163527", "Sommer→Winter + Einlagerung Hotel", 1, "CONFIRMED"],
    [7, "08:15", "09:00", "Hebebühne 3", "SH 174092", "Winterreifen montieren", 1, "CONFIRMED"],
    [7, "09:00", "09:45", "Hebebühne 3", "SH 195422", "Winterreifen Flotte", 1, "CONFIRMED"],
    [7, "09:45", "10:30", "Hebebühne 3", "SH 230718", "Winterreifen Transporter", 1, "CONFIRMED"],
    [7, "10:30", "12:00", "Hebebühne 2", "SH 263891", "Stossdämpfer hinten (Leihwagen läuft)", 2, "CONFIRMED"],
    [7, "13:15", "14:30", "Hebebühne 1", "SH 315842", "Hinterachse nachstellen", 2, "CONFIRMED"],
    [7, "13:30", "14:15", "Hebebühne 4", "SH 339671", "Winterreifen montieren", 1, "CONFIRMED"],
    [7, "14:15", "15:00", "Hebebühne 4", "SH 296530", "Räder auswuchten", 1, "CONFIRMED"],
    [7, "15:00", "15:45", "Hebebühne 4", "SH 351208", "TPMS-Sensoren prüfen", 2, "CONFIRMED"],
    [7, "16:00", "16:45", "Roger Willi", "SH 201574", "Reifenhotel-Platzierung (Online-Schalter-Anfrage)", 1, "CONFIRMED"],
    // Dienstag
    [8, "07:30", "11:30", "Hebebühne 1", "SH 187365", "Zahnriemen + Wasserpumpe (Leihwagen läuft)", 2, "CONFIRMED"],
    [8, "08:00", "09:00", "Jason Pagnin", "SH 339671", "Diagnose Airbag-Warnleuchte", 3, "CONFIRMED"],
    [8, "07:45", "08:30", "Hebebühne 3", "SH 284103", "Reifen-Comeback-Check (Hotel)", 1, "CONFIRMED"],
    [8, "08:30", "09:15", "Hebebühne 3", "SH 310284", "Winterreifen Flotte", 1, "CONFIRMED"],
    [8, "09:15", "10:00", "Hebebühne 3", "SH 318460", "Winterreifen Flotte", 1, "CONFIRMED"],
    [8, "10:00", "11:00", "Hebebühne 2", "SH 296530", "MFK-Vorbereitung", 1, "CONFIRMED"],
    [8, "11:00", "11:45", "Besim Sherifi", "SH 254176", "Reifenhotel-Beratung (Winter-Satz lagert)", 1, "CONFIRMED"],
    [8, "13:15", "15:00", "Hebebühne 2", "SH 254176", "Winterreifen vom Hotel montieren", 1, "CONFIRMED"],
    [8, "13:30", "14:15", "Hebebühne 4", "SH 339671", "Winterreifen montieren", 1, "CONFIRMED"],
    [8, "14:15", "15:00", "Hebebühne 4", "SH 296530", "Winterreifen montieren", 1, "CONFIRMED"],
    [8, "15:00", "15:45", "Hebebühne 4", "SH 163527", "Sommer-Räder ins Hotel (R1-Platz)", 1, "CONFIRMED"],
    [8, "16:00", "16:30", "—", "—", "Anfrage Online-Schalter: Reifen-Offerte VW T6", 0, "REQUESTED"],
    // Mittwoch
    [9, "07:30", "09:30", "Hebebühne 1", "SH 187365", "Zahnriemen + Wasserpumpe (Fertigstellung)", 2, "CONFIRMED"],
    [9, "07:45", "08:30", "Hebebühne 3", "SH 248930", "Winterreifen-Check nach 1'000 km", 1, "CONFIRMED"],
    [9, "08:30", "09:15", "Hebebühne 3", "SH 322145", "Winterreifen montieren", 1, "CONFIRMED"],
    [9, "09:15", "10:00", "Hebebühne 3", "SH 345012", "Winterreifen montieren", 1, "CONFIRMED"],
    [9, "10:30", "12:00", "Hebebühne 2", "SH 230718", "Kupplung + Bremsdienst", 2, "CONFIRMED"],
    [9, "10:30", "11:15", "Jason Pagnin", "SH 351208", "Diagnose Ladeproblem (Nachkontrolle)", 3, "CONFIRMED"],
    [9, "13:15", "14:45", "Hebebühne 1", "SH 174092", "Auspuffanlage ersetzen (Leihwagen läuft)", 2, "CONFIRMED"],
    [9, "13:30", "14:15", "Hebebühne 4", "SH 301872", "Reifen-Hotel: Platzwechsel R1 zu R2", 1, "CONFIRMED"],
    [9, "14:30", "15:15", "Hebebühne 4", "SH 263891", "Sommer-Räder ins Hotel", 1, "CONFIRMED"],
    [9, "15:15", "16:00", "Hebebühne 4", "SH 219873", "Winterreifen montieren", 1, "CONFIRMED"],
    [9, "15:30", "16:30", "Marcel Steinemann", "SH 195422", "Frontscheibe Steinchenschaden", 1, "CONFIRMED"],
    [9, "16:30", "17:00", "Cedric Holenstein", "SH 318460", "Fehlerspeicher Flotte auslesen", 2, "CONFIRMED"],
    // Donnerstag
    [10, "07:30", "09:00", "Hebebühne 1", "SH 263891", "Stossdämpfer hinten (Fortsetzung)", 2, "CONFIRMED"],
    [10, "07:45", "08:30", "Hebebühne 3", "SH 315842", "Winterreifen-Check", 1, "CONFIRMED"],
    [10, "08:30", "09:15", "Hebebühne 3", "SH 351208", "Winterreifen TPMS einlernen", 2, "CONFIRMED"],
    [10, "09:15", "10:00", "Hebebühne 3", "SH 219873", "Winterreifen montieren", 1, "CONFIRMED"],
    [10, "10:00", "11:30", "Hebebühne 2", "SH 296530", "MFK-Vorbereitung (Bremsen)", 1, "CONFIRMED"],
    [10, "10:45", "11:30", "Jason Pagnin", "SH 339671", "Airbag-Leuchte Abschlussdiagnose", 3, "CONFIRMED"],
    [10, "13:15", "14:00", "Hebebühne 1", "SH 163527", "Service klein", 1, "CONFIRMED"],
    [10, "13:30", "14:15", "Hebebühne 4", "SH 284103", "Winterreifen Ruhedruck", 1, "CONFIRMED"],
    [10, "14:15", "15:00", "Hebebühne 4", "SH 310284", "Flotte: Beleuchtung + Scheiben", 1, "CONFIRMED"],
    [10, "15:00", "15:45", "Hebebühne 4", "SH 318460", "Flotte: Winterreifen nachziehen", 1, "CONFIRMED"],
    [10, "14:00", "15:30", "Marco Eichmann", "SH 254176", "Winter-Satz aus Hotel montieren", 1, "CONFIRMED"],
    [10, "16:00", "16:45", "Elvedin Memedoski", "SH 201574", "Räder reinigen + Hotel einlagern", 1, "CONFIRMED"],
    // Freitag
    [11, "07:30", "08:15", "Hebebühne 3", "SH 195422", "Winterreifen Flotte (2. Fahrzeug)", 1, "CONFIRMED"],
    [11, "07:30", "09:30", "Hebebühne 1", "SH 228940", "Bremsen hinten + Achsvermessung", 2, "CONFIRMED"],
    [11, "08:15", "09:00", "Hebebühne 4", "SH 230718", "Winterreifen Transporter", 1, "CONFIRMED"],
    [11, "09:00", "10:00", "Hebebühne 2", "SH 322145", "Service-Nachkontrolle", 1, "CONFIRMED"],
    [11, "09:30", "10:15", "Hebebühne 4", "SH 339671", "Winterreifen montieren", 1, "CONFIRMED"],
    [11, "10:30", "11:15", "Jason Pagnin", "SH 351208", "Ladeproblem: Software-Update", 3, "CONFIRMED"],
    [11, "11:15", "12:00", "Besim Sherifi", "SH 201574", "Reifenhotel: Lagerplatz zuweisen", 1, "CONFIRMED"],
    [11, "13:15", "14:30", "Hebebühne 1", "SH 174092", "Auspuff: Endkontrolle", 2, "CONFIRMED"],
    [11, "13:30", "14:15", "Hebebühne 4", "SH 296530", "MFK-Termin Übergabe", 1, "CONFIRMED"],
    [11, "14:30", "15:15", "Gianni Verrilli", "SH 345012", "Lichttest", 1, "CONFIRMED"],
    [11, "15:00", "15:45", "Hebebühne 2", "SH 351208", "TPMS abschliessen", 2, "CONFIRMED"],
    [11, "15:45", "16:15", "—", "—", "Kunde kurzfristig abgesagt (Reifenwechsel)", 1, "CANCELLED"],
    // Samstagvormittag
    [12, "09:00", "09:45", "Hebebühne 3", "SH 163527", "Winterreifen-Notfall-Termin", 1, "CONFIRMED"],
    [12, "09:45", "10:30", "Hebebühne 3", "SH 315842", "Reifen-Druckkontrolle", 1, "CONFIRMED"],
  ];

  let angelegt = 0;
  for (const [day, from, to, resource, plate, reason, reqSkill, status] of plan) {
    // «—» = Termin ohne konkretes Fahrzeug (Online-Anfrage/Absage) — auf Mosers Clio als Platzhalter
    const v = plate === "—" ? veh("SH 201574") : veh(plate);
    if (!v) { console.warn(`⚠ Kennzeichen im Plan ohne Datensatz: ${plate} — übersprungen`); continue; }
    const start = at(day, from);
    const dup = await prisma.appointment.findFirst({ where: { start, vehicleId: v.id, reason } });
    if (dup) continue;
    await prisma.appointment.create({
      data: {
        customerId: v.customerId,
        vehicleId: v.id,
        resourceId: resource !== "—" ? res[resource] : undefined,
        requiredSkill: reqSkill,
        status,
        reason,
        start,
        end: at(day, to),
      },
    });
    angelegt++;
  }
  console.log(`✓ Werkstattplan: ${angelegt} Termine (2 Wochen Hochsaison, 4 Bühnen)`);

  console.log("\nDemo-Logins (Passwort für alle: mechbox2026):");
  for (const t of team) console.log(`  ${t.email} — ${t.name} (${t.jobTitle})`);
  console.log("  chef@werkstatt.ch / changeme — bestehender Login (unverändert)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

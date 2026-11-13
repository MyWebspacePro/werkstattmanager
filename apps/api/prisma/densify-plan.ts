/**
 * Dichtet den Werkstattplan auf: füllt die Arbeitsplätze (Hebebühnen + RWZ) über
 * einen Zeitraum mit realistischen Terminen aus dem Arbeitsarten-Katalog, bis
 * ~88 % der Öffnungszeit belegt ist (Samstag halber Tag, ~50 %). Jeder neue
 * Termin bekommt gleichzeitig einen freien, qualifizierten Mechaniker
 * (Balancing nach Tagesbelastung, weiche Präferenz nach Berufsbild) und ein
 * freies Fahrzeug. Vergangene Termine im Zeitraum werden auf DONE /
 * IN_PROGRESS gesetzt, damit der Plan wie ein echter Rückblick aussieht.
 *
 * Erzeugt zusätzlich Demokunden mit Fahrzeugen (idempotent über die E-Mail).
 *
 *   cd apps/api && npx tsx --env-file=.env prisma/densify-plan.ts --from 2026-11-02 --to 2026-11-14
 *
 * Idempotent: belegte Bühnen/Mechaniker/Fahrzeuge werden nicht doppelt belegt;
 * Kunden nur angelegt, wenn die E-Mail noch nicht existiert. Bestehende
 * REQUESTED-Termine (Chef-Bestätigungs-Demo) bleiben unangetastet.
 */
import { prisma } from "../src/lib/prisma.js";
import { addZonedDays, zonedDayKey, zonedMake, zonedParts } from "../src/lib/shopTime.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const FROM = arg("--from");
const TO = arg("--to");
if (!FROM || !TO) {
  console.error("Aufruf: npx tsx prisma/densify-plan.ts --from 2026-11-02 --to 2026-11-14");
  process.exit(1);
}

/** Deterministischer Zufall — gleiches Ergebnis bei jedem Lauf. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261113);

type Res = { id: string; name: string; type: string; skillLevel: number; jobTitle?: string | null; workMinutesPerDay?: number };
type Wt = { id: string; name: string; defaultMinutes: number; requiredSkill: number };
type Veh = { id: string; licensePlate: string; customerId: string };
type ApptStatus = "DONE" | "IN_PROGRESS" | "CONFIRMED";

/** Wer passt zum Termin? (weiche Präferenz, wie in backfill-plan.ts) */
const PREFERENCE_RULES: Array<{ match: RegExp; prefer: RegExp }> = [
  { match: /diagnose|can-bus|motorleuchte|startprobleme|airbag|steuergerät|ladebuchse|tpms/i, prefer: /diagnostiker/i },
  { match: /reifen|räder|einlager|wuchten|hotel/i, prefer: /reifenpraktiker/i },
  { match: /brems|achsvermess|stossdämpfer|kupplung|zahnriemen|elektrik|fensterheber|klima/i, prefer: /mechatroniker/i },
];

interface DemoVehicle { licensePlate: string; brand: string; model: string; year: number; fuel: string }
interface DemoCustomer {
  type: "PRIVATE" | "COMPANY" | "FLEET";
  firstName?: string; lastName?: string; company?: string;
  email: string; phone: string; street: string; zip: string; city: string;
  vehicles: DemoVehicle[];
}

const DEMO_CUSTOMERS: DemoCustomer[] = [
  { type: "PRIVATE", firstName: "Sandra", lastName: "Kägi", email: "sandra.kaegi@bluewin.ch", phone: "+41 79 401 22 84", street: "Fäsenstaubstrasse 14", zip: "8200", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 418302", brand: "Volkswagen", model: "Polo 1.0 TSI", year: 2019, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Tobias", lastName: "Wirth", email: "tobias.wirth@gmail.com", phone: "+41 76 322 91 07", street: "Rheinfallstrasse 45", zip: "8212", city: "Neuhausen am Rheinfall", vehicles: [{ licensePlate: "SH 426157", brand: "Skoda", model: "Fabia 1.0 MPI", year: 2016, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Nicole", lastName: "Bühler", email: "nicole.buehler@hispeed.ch", phone: "+41 77 445 63 21", street: "Halde 22", zip: "8222", city: "Beringen", vehicles: [{ licensePlate: "SH 431944", brand: "Toyota", model: "Corolla 1.8 Hybrid", year: 2020, fuel: "Hybrid" }] },
  { type: "PRIVATE", firstName: "Andreas", lastName: "Steiner", email: "a.steiner@sunrise.ch", phone: "+41 79 218 50 66", street: "Breitenaustrasse 30", zip: "8245", city: "Feuerthalen", vehicles: [{ licensePlate: "SH 445210", brand: "Volvo", model: "V60 D4", year: 2015, fuel: "Diesel" }] },
  { type: "PRIVATE", firstName: "Yvonne", lastName: "Meili", email: "yvonne.meili@bluewin.ch", phone: "+41 76 501 78 43", street: "Müllheimerstrasse 23", zip: "8203", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 452638", brand: "Mazda", model: "2 1.5 Skyactiv", year: 2017, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Raphael", lastName: "Bundi", email: "raphael.bundi@gmail.com", phone: "+41 78 864 19 52", street: "Genferstrasse 8", zip: "8207", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 460173", brand: "Hyundai", model: "i30 1.4 T-GDI", year: 2018, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Claudia", lastName: "Nänni", email: "claudia.naenni@web.de", phone: "+49 1522 370 41 96", street: "Hugo-Weiss-Strasse 3", zip: "78262", city: "Büsingen", vehicles: [{ licensePlate: "BÜS X 12", brand: "Renault", model: "Clio TCe 140", year: 2019, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Markus", lastName: "Sutter", email: "markus.sutter@bluewin.ch", phone: "+41 79 357 88 12", street: "Dorfstrasse 11", zip: "8262", city: "Ramsen", vehicles: [{ licensePlate: "SH 470846", brand: "Fiat", model: "500 1.2 8V", year: 2015, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Petra", lastName: "Frei", email: "petra.frei@gmail.com", phone: "+41 76 689 34 20", street: "Spitalstrasse 18", zip: "8204", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 478291", brand: "Peugeot", model: "208 1.2 PureTech", year: 2020, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Daniel", lastName: "Hunziker", email: "d.hunziker@hispeed.ch", phone: "+41 77 930 46 75", street: "Schleitheimerstrasse 57", zip: "8225", city: "Schleitheim", vehicles: [{ licensePlate: "SH 483617", brand: "Seat", model: "Leon 1.5 TSI", year: 2019, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Sina", lastName: "Wyss", email: "sina.wyss@gmx.ch", phone: "+41 79 512 60 39", street: "Vorstadt 26", zip: "8200", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 490354", brand: "Kia", model: "Rio 1.2 DPI", year: 2018, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Remo", lastName: "Cavelti", email: "remo.cavelti@bluewin.ch", phone: "+41 78 205 47 81", street: "Ramsenstrasse 4", zip: "8262", city: "Ramsen", vehicles: [{ licensePlate: "SH 496802", brand: "Dacia", model: "Duster TCe 130", year: 2021, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Esther", lastName: "Schmid", email: "esther.schmid76@gmail.com", phone: "+41 79 663 25 18", street: "Emmersbergstrasse 9", zip: "8208", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 502469", brand: "Opel", model: "Corsa 1.2", year: 2016, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Jonas", lastName: "Frutiger", email: "jonas.frutiger@proton.me", phone: "+41 76 741 92 55", street: "Neuhauserstrasse 5", zip: "8212", city: "Neuhausen am Rheinfall", vehicles: [{ licensePlate: "SH 508713", brand: "Ford", model: "Fiesta 1.0 EcoBoost", year: 2017, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Lea", lastName: "Anderegg", email: "lea.anderegg@bluewin.ch", phone: "+41 77 118 03 94", street: "Rosengasse 16", zip: "8200", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 514268", brand: "Citroen", model: "C3 1.2 PureTech", year: 2019, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Urs", lastName: "Pfister", email: "urs.pfister@hispeed.ch", phone: "+41 79 274 68 31", street: "Beringerstrasse 28", zip: "8222", city: "Beringen", vehicles: [{ licensePlate: "SH 520741", brand: "Nissan", model: "Qashqai 1.3 DIG-T", year: 2019, fuel: "Benzin" }] },
  { type: "PRIVATE", firstName: "Miriam", lastName: "Baumann", email: "miriam.baumann@gmail.com", phone: "+41 76 983 51 42", street: "Herbstäckerstrasse 12", zip: "8245", city: "Feuerthalen", vehicles: [{ licensePlate: "SH 527385", brand: "Audi", model: "A3 Sportback 30 TDI", year: 2020, fuel: "Diesel" }] },
  { type: "COMPANY", company: "Gemeindekanzlei Beringen", email: "verwaltung@beringen.ch", phone: "+41 52 687 11 44", street: "Dorfstrasse 1", zip: "8222", city: "Beringen", vehicles: [
    { licensePlate: "SH 534190", brand: "Ford", model: "Transit Custom 2.0 TDCI", year: 2019, fuel: "Diesel" },
    { licensePlate: "SH 535077", brand: "Toyota", model: "Hilux 2.4 D-4D", year: 2017, fuel: "Diesel" },
  ] },
  { type: "PRIVATE", firstName: "Karin", lastName: "Oswald", email: "karin.oswald@bluewin.ch", phone: "+41 79 446 37 08", street: "Weierstrasse 7", zip: "8203", city: "Schaffhausen", vehicles: [{ licensePlate: "SH 541628", brand: "Subaru", model: "XV 2.0i e-Boxer", year: 2018, fuel: "Hybrid" }] },
  { type: "COMPANY", company: "Elektro Weber AG", email: "info@elektro-weber.ch", phone: "+41 52 625 40 90", street: "Industriestrasse 10", zip: "8200", city: "Schaffhausen", vehicles: [
    { licensePlate: "SH 548915", brand: "Volkswagen", model: "e-Golf", year: 2020, fuel: "Elektro" },
    { licensePlate: "SH 549862", brand: "Renault", model: "Kangoo Z.E.", year: 2019, fuel: "Elektro" },
  ] },
];

async function ensureCustomers(): Promise<number> {
  let created = 0;
  for (const c of DEMO_CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { email: c.email } });
    if (existing) continue;
    const customer = await prisma.customer.create({
      data: {
        type: c.type,
        firstName: c.firstName ?? null,
        lastName: c.lastName ?? null,
        company: c.company ?? null,
        email: c.email,
        phone: c.phone,
        street: c.street,
        zip: c.zip,
        city: c.city,
      },
    });
    for (const v of c.vehicles) {
      const plateTaken = await prisma.vehicle.findFirst({ where: { licensePlate: v.licensePlate } });
      if (plateTaken) continue;
      const age = Math.max(1, 2026 - v.year);
      await prisma.vehicle.create({
        data: {
          customerId: customer.id,
          licensePlate: v.licensePlate,
          brand: v.brand,
          model: v.model,
          year: v.year,
          fuel: v.fuel,
          mileage: Math.round((9000 + age * (6000 + rnd() * 9000)) / 100) * 100,
        },
      });
    }
    created++;
  }
  return created;
}

interface Span { s: number; e: number }

function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.s - b.s);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.s <= last.e) last.e = Math.max(last.e, s.e);
    else out.push({ ...s });
  }
  return out;
}

/** Gewichtete Auswahl: kurze/mittlere Jobs häufig, Grossjobs selten. */
const WEIGHTS: Record<number, number> = { 15: 1.2, 30: 2.2, 45: 1.8, 60: 2.0, 90: 1.1, 120: 0.7, 150: 0.4, 240: 0.22 };
function pickWeighted(list: Wt[]): Wt {
  const total = list.reduce((s, w) => s + (WEIGHTS[w.defaultMinutes] ?? 1), 0);
  let x = rnd() * total;
  for (const w of list) {
    x -= WEIGHTS[w.defaultMinutes] ?? 1;
    if (x <= 0) return w;
  }
  return list[list.length - 1];
}

const isApprentice = (m: Res) => /lernend|assistent/i.test(m.jobTitle ?? "");

async function main() {
  const settings = await prisma.setting.findFirst();
  const shopStartMin = settings?.shopStartMin ?? 420;
  const shopEndMin = settings?.shopEndMin ?? 1080;
  const saturdayOpen = settings?.saturdayOpen ?? false;

  const customersAdded = await ensureCustomers();

  const stations = (await prisma.resource.findMany({ where: { active: true, type: { not: "MECHANIC" } }, orderBy: { sortOrder: "asc" } })) as Res[];
  const mechanics = (await prisma.resource.findMany({ where: { active: true, type: "MECHANIC" } })) as Res[];
  const workTypes = (await prisma.workType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })) as Wt[];
  const vehicles = (await prisma.vehicle.findMany({ where: { archived: false }, orderBy: { licensePlate: "asc" } })) as Veh[];

  // Belegung im Zeitraum, in Lokal-Minuten seit Mitternacht je Tag.
  const rangeStart = zonedMake(FROM!, 0);
  const rangeEnd = zonedMake(addZonedDays(TO!, 1), 0);
  const existing = await prisma.appointment.findMany({
    where: { start: { gte: rangeStart, lt: rangeEnd }, status: { not: "CANCELLED" } },
    select: { id: true, start: true, end: true, resourceId: true, mechanicId: true, vehicleId: true, status: true },
  });

  const busy = new Map<string, Span[]>(); // key = ressourceId bzw. veh:<id>, plus Tag
  const bookedMin = new Map<string, number>();
  const addBusy = (key: string, dayKey: string, s: number, e: number) => {
    const k = `${key}|${dayKey}`;
    busy.set(k, [...(busy.get(k) ?? []), { s, e }]);
    bookedMin.set(k, (bookedMin.get(k) ?? 0) + (e - s));
  };
  for (const a of existing) {
    const sp = zonedParts(new Date(a.start));
    const ep = zonedParts(new Date(a.end));
    const dayKey = zonedDayKey(new Date(a.start));
    const s = sp.hour * 60 + sp.minute;
    const e = Math.max(ep.hour * 60 + ep.minute, s + 15);
    if (a.resourceId) addBusy(a.resourceId, dayKey, s, e);
    if (a.mechanicId) addBusy(a.mechanicId, dayKey, s, e);
    addBusy(`veh:${a.vehicleId}`, dayKey, s, e);
  }

  const isFree = (key: string, dayKey: string, s: number, e: number) =>
    !(busy.get(`${key}|${dayKey}`) ?? []).some((b) => s < b.e && b.s < e);
  const load = (key: string, dayKey: string) => bookedMin.get(`${key}|${dayKey}`) ?? 0;

  /** Status wie ein echter Lauf: vorbei = fertig, laufend = in Arbeit. */
  const nowP = zonedParts(new Date());
  const todayKey = `${nowP.year}-${String(nowP.month).padStart(2, "0")}-${String(nowP.day).padStart(2, "0")}`;
  const nowMin = nowP.hour * 60 + nowP.minute;
  const statusFor = (dayKey: string, s: number, e: number): ApptStatus => {
    if (dayKey < todayKey) return "DONE";
    if (dayKey > todayKey) return "CONFIRMED";
    if (e <= nowMin) return "DONE";
    if (s <= nowMin) return "IN_PROGRESS";
    return "CONFIRMED";
  };

  // Rückblick: vergangene Termine im Zeitraum auf DONE/IN_PROGRESS bringen —
  // REQUESTED (Chef-Bestätigungs-Demo) und CANCELLED bleiben unangetastet.
  let retro = 0;
  for (const a of existing) {
    if (a.status === "REQUESTED") continue;
    const sp = zonedParts(new Date(a.start));
    const ep = zonedParts(new Date(a.end));
    const dayKey = zonedDayKey(new Date(a.start));
    const next = statusFor(dayKey, sp.hour * 60 + sp.minute, ep.hour * 60 + ep.minute);
    if (next !== "DONE" && next !== "IN_PROGRESS") continue;
    if (a.status !== next) {
      await prisma.appointment.update({ where: { id: a.id }, data: { status: next } });
      retro++;
    }
  }

  // Tagliste FROM..TO (inklusiv), Wochenenden respektiert.
  const days: string[] = [];
  for (let d = FROM!; d <= TO!; d = addZonedDays(d, 1)) days.push(d);

  let created = 0;
  const perMechanic = new Map<string, number>();

  for (const dayKey of days) {
    const dow = zonedParts(zonedMake(dayKey, 720)).dow;
    if (dow === 0) continue;
    if (dow === 6 && !saturdayOpen) continue;
    const winStart = dow === 6 ? 480 : shopStartMin; // Samstag 08:00–12:00
    const winEnd = dow === 6 ? Math.min(720, shopEndMin) : shopEndMin;
    const windowMin = winEnd - winStart;
    if (windowMin <= 0) continue;
    const budget = (dow === 6 ? 0.5 : 0.88) * windowMin;
    const lunch: Span | null = dow === 6 ? null : { s: 720, e: 765 }; // Mittagspause

    // Round-robin über die Stationen: jede bekommt reihum einen Termin, bis sie
    // ihr Budget erreicht hat. So läuft nicht die erste Station die Mechaniker
    // leer, während die übrigen Stationen ungenutzt bleiben.
    let progressed = true;
    let guard = 0;
    while (progressed && guard++ < 60) {
      progressed = false;
      for (const st of stations) {
        const cur = load(st.id, dayKey);
        if (cur >= budget) continue;
        const blocked = merge([...(busy.get(`${st.id}|${dayKey}`) ?? []), ...(lunch ? [lunch] : [])]);

        // Alle Lücken ≥ 30 Min im Tagesfenster, größte zuerst — kleine Restlücken
        // dürfen die Suche nicht blockieren.
        const gaps: Span[] = [];
        let cursor = winStart;
        for (const g of blocked) {
          if (g.s - cursor >= 30) gaps.push({ s: cursor, e: g.s });
          cursor = Math.max(cursor, g.e);
        }
        if (winEnd - cursor >= 30) gaps.push({ s: cursor, e: winEnd });
        gaps.sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s);

        // Erste Lücke, in die ein Job passt und in der ein Mechaniker frei ist.
        for (const gap of gaps) {
          const freeLen = gap.e - gap.s;
          const fitting = workTypes.filter(
            (w) =>
              w.defaultMinutes <= freeLen &&
              w.defaultMinutes >= Math.min(30, freeLen) &&
              cur + w.defaultMinutes <= Math.max(budget, cur + 45),
          );
          if (fitting.length === 0) continue;
          const wt = pickWeighted(fitting);
          const dur = wt.defaultMinutes;
          // natürlicher Versatz in grossen Lücken, damit nichts wie gestempelt wirkt
          let t0 = gap.s;
          if (freeLen - dur >= 45 && rnd() < 0.35) t0 += 15 * Math.floor(rnd() * 3);
          t0 = Math.min(t0, gap.e - dur);

          // Mechaniker: qualifiziert, frei, Tagesbudget reicht; Grossjobs nicht auf Lernende
          const pool = mechanics.filter(
            (m) =>
              (m.skillLevel ?? 0) >= wt.requiredSkill &&
              isFree(m.id, dayKey, t0, t0 + dur) &&
              load(m.id, dayKey) + dur <= (m.workMinutesPerDay ?? 510) - 15 &&
              (!isApprentice(m) || dur <= 90),
          );
          const candidates = pool.length
            ? pool
            : mechanics.filter((m) => (m.skillLevel ?? 0) >= wt.requiredSkill && isFree(m.id, dayKey, t0, t0 + dur));
          if (candidates.length === 0) continue;
          const scored = candidates.map((m) => {
            let sc = 0;
            if (PREFERENCE_RULES.some((r) => r.match.test(wt.name) && r.prefer.test(m.jobTitle ?? ""))) sc += 25;
            if ((m.skillLevel ?? 0) === wt.requiredSkill) sc += 12;
            sc -= load(m.id, dayKey) / 40;
            if (isApprentice(m) && dur > 90) sc -= 30;
            return { m, sc };
          });
          scored.sort((a, b) => b.sc - a.sc || a.m.name.localeCompare(b.m.name, "de"));
          const mech = scored[0].m;

          // freies Fahrzeug (rotierend durch den Bestand)
          let veh: Veh | undefined;
          for (let i = 0; i < vehicles.length; i++) {
            const cand = vehicles[(created + i) % vehicles.length];
            if (isFree(`veh:${cand.id}`, dayKey, t0, t0 + dur)) { veh = cand; break; }
          }
          if (!veh) continue;

          const status = statusFor(dayKey, t0, t0 + dur);
          await prisma.appointment.create({
            data: {
              customerId: veh.customerId,
              vehicleId: veh.id,
              resourceId: st.id,
              mechanicId: mech.id,
              start: zonedMake(dayKey, t0),
              end: zonedMake(dayKey, t0 + dur),
              status,
              requiredSkill: wt.requiredSkill,
              reason: wt.name,
            },
          });
          addBusy(st.id, dayKey, t0, t0 + dur);
          addBusy(mech.id, dayKey, t0, t0 + dur);
          addBusy(`veh:${veh.id}`, dayKey, t0, t0 + dur);
          perMechanic.set(mech.id, (perMechanic.get(mech.id) ?? 0) + dur);
          created++;
          progressed = true;
          break;
        }
      }
    }
  }

  console.log(`✓ Demokunden angelegt: ${customersAdded}`);
  console.log(`✓ Neue Termine: ${created}`);
  if (retro) console.log(`✓ Vergangene Termine auf DONE/IN_PROGRESS gesetzt: ${retro}`);
  const names = new Map(mechanics.map((m) => [m.id, m.name]));
  console.log("— Mechaniker-Belastung im Zeitraum (neu dazu):");
  for (const [id, min] of [...perMechanic.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${names.get(id) ?? id}: ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

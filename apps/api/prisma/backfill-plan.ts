/**
 * Zieht den Werkstattplan nach: jeder Termin soll Bühne UND Mechaniker haben.
 *
 * Hintergrund: im Demo-Szenario war jeder Termin entweder einer Bühne oder einer
 * Person zugewiesen — im Planer sah damit eine der beiden Ansichten halb leer aus.
 *
 * Idempotent: was schon zugewiesen ist, bleibt. Es prüft Überschneidungen wie die
 * API (`start < end && end > start`, annullierte Termine zählen nicht) und wählt
 * die am wenigsten belastete passende Ressource.
 *
 *   cd apps/api && npx tsx --env-file=.env prisma/backfill-plan.ts
 */
import { prisma } from "../src/lib/prisma.js";

type Res = { id: string; name: string; type: string; skillLevel: number };
type Appt = { id: string; start: Date; end: Date; status: string; resourceId: string | null; mechanicId: string | null; requiredSkill: number };

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

async function main() {
  const resources = (await prisma.resource.findMany({ where: { active: true } })) as Res[];
  const stations = resources.filter((r) => r.type !== "MECHANIC");
  const mechanics = resources.filter((r) => r.type === "MECHANIC");

  const appointments = (await prisma.appointment.findMany({
    select: { id: true, start: true, end: true, status: true, resourceId: true, mechanicId: true, requiredSkill: true },
    orderBy: { start: "asc" },
  })) as Appt[];

  // Belegung je Ressource — annullierte Termine blockieren nicht.
  const busy = new Map<string, Array<{ start: Date; end: Date }>>();
  const load = new Map<string, number>();
  const mark = (id: string, start: Date, end: Date) => {
    busy.set(id, [...(busy.get(id) ?? []), { start, end }]);
    load.set(id, (load.get(id) ?? 0) + (end.getTime() - start.getTime()) / 60000);
  };
  for (const a of appointments) {
    if (a.status === "CANCELLED") continue;
    if (a.resourceId) mark(a.resourceId, a.start, a.end);
    if (a.mechanicId) mark(a.mechanicId, a.start, a.end);
  }

  const isFree = (id: string, start: Date, end: Date) =>
    !(busy.get(id) ?? []).some((b) => overlaps(start, end, b.start, b.end));

  const pick = (candidates: Res[], start: Date, end: Date): Res | undefined => {
    const free = candidates.filter((c) => isFree(c.id, start, end));
    if (free.length === 0) return undefined;
    // Am wenigsten belastete zuerst — verteilt die Arbeit gleichmässig.
    return free.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name, "de"))[0];
  };

  let mechanicsAdded = 0;
  let stationsAdded = 0;
  let skipped = 0;

  for (const a of appointments) {
    if (a.status === "CANCELLED") continue;
    const patch: { mechanicId?: string; resourceId?: string } = {};

    if (!a.mechanicId) {
      const pool = mechanics.filter((m) => (m.skillLevel ?? 0) >= (a.requiredSkill ?? 0));
      const chosen = pick(pool, a.start, a.end) ?? pick(mechanics, a.start, a.end);
      if (chosen) {
        patch.mechanicId = chosen.id;
        mark(chosen.id, a.start, a.end);
        mechanicsAdded++;
      }
    }

    if (!a.resourceId) {
      const chosen = pick(stations, a.start, a.end);
      if (chosen) {
        patch.resourceId = chosen.id;
        mark(chosen.id, a.start, a.end);
        stationsAdded++;
      }
    }

    if (Object.keys(patch).length === 0) {
      if (!a.mechanicId || !a.resourceId) skipped++;
      continue;
    }
    await prisma.appointment.update({ where: { id: a.id }, data: patch });
  }

  console.log(`✓ Mechaniker zugewiesen: ${mechanicsAdded}`);
  console.log(`✓ Arbeitsplätze zugewiesen: ${stationsAdded}`);
  if (skipped) console.log(`– ohne freie Ressource geblieben: ${skipped} (z. B. Ueberschneidungen)`);
  console.log(`✓ ${appointments.length} Termine geprüft`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
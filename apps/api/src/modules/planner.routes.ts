import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { getSettings } from "./settings.routes.js";
import { addZonedDays, zonedDayKey, zonedMake } from "../lib/shopTime.js";

const appointmentFields = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  resourceId: z.string().optional(),
  mechanicId: z.string().optional(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["REQUESTED", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"]).default("CONFIRMED"),
  requiredSkill: z.coerce.number().int().min(0).max(3).default(0),
  override: z.boolean().optional(), // Chef: Doppelbelegung erlauben (protokolliert)
  autoAssign: z.boolean().optional(), // Bühne/Mechaniker automatisch wählen (Auto-Verplanung)
});

const appointmentSchema = appointmentFields.refine((d) => d.end > d.start, {
  message: "Ende muss nach Start liegen",
  path: ["end"],
});

const updateSchema = appointmentFields.partial().extend({ override: z.boolean().optional() }).refine((d) => !d.start || !d.end || d.end > d.start, {
  message: "Ende muss nach Start liegen",
  path: ["end"],
});

interface BusySpan { start: Date; end: Date }

async function busyFor(resourceIds: string[], mechanicIds: string[], from: Date, to: Date) {
  const rows = await prisma.appointment.findMany({
    where: {
      status: { notIn: ["CANCELLED"] },
      start: { lt: to },
      end: { gt: from },
      OR: [
        { resourceId: { in: resourceIds } },
        { mechanicId: { in: mechanicIds } },
      ],
    },
    select: { resourceId: true, mechanicId: true, start: true, end: true },
  });
  const byResource = new Map<string, BusySpan[]>();
  const byMechanic = new Map<string, BusySpan[]>();
  for (const r of rows) {
    if (r.resourceId) byResource.set(r.resourceId, [...(byResource.get(r.resourceId) ?? []), { start: r.start, end: r.end }]);
    if (r.mechanicId) byMechanic.set(r.mechanicId, [...(byMechanic.get(r.mechanicId) ?? []), { start: r.start, end: r.end }]);
  }
  return { byResource, byMechanic };
}

const overlaps = (busy: BusySpan[] | undefined, start: Date, end: Date) =>
  !!busy?.some((b) => start < b.end && b.start < end);

/** Kollidierende Termine mit Kontext — für die Override-Warnung im Client. */
async function findConflicts(resourceId: string | undefined, mechanicId: string | undefined, start: Date, end: Date, excludeId?: string) {
  if (!resourceId && !mechanicId) return [];
  const rows = await prisma.appointment.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ["CANCELLED"] },
      start: { lt: end },
      end: { gt: start },
      OR: [
        ...(resourceId ? [{ resourceId }] : []),
        ...(mechanicId ? [{ mechanicId }] : []),
      ],
    },
    include: {
      vehicle: { select: { licensePlate: true } },
      resource: { select: { name: true } },
      mechanic: { select: { name: true } },
    },
    orderBy: { start: "asc" },
    take: 6,
  });
  return rows.map((r) => ({
    plate: r.vehicle?.licensePlate ?? "—",
    reason: r.reason ?? "",
    start: r.start,
    end: r.end,
    lane: r.resource?.name ?? r.mechanic?.name ?? "—",
  }));
}

/** Am wenigsten belastete Ressource, die im Slot frei ist (Auslastung = Minuten im Suchfenster). */
function leastBusy(busy: Map<string, BusySpan[]>, candidates: Array<{ id: string; name?: string }>, start: Date, end: Date) {
  const free = candidates.filter((c) => !overlaps(busy.get(c.id), start, end));
  if (free.length === 0) return undefined;
  const load = (id: string) => (busy.get(id) ?? []).reduce((sum, b) => sum + Math.max(0, Math.min(b.end.getTime(), end.getTime()) - Math.max(b.start.getTime(), start.getTime())), 0);
  return free.sort((a, b) => load(a.id) - load(b.id) || (a.name?.localeCompare(b.name ?? "", "de") ?? 0))[0];
}

export async function plannerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // ── Ressourcen (Hebebühnen, Mechaniker, Plätze) ──
  // ?all=1 liefert auch deaktivierte — für die Verwaltung im Planer.
  app.get("/resources", async (req) => {
    const { all } = (req.query ?? {}) as { all?: string };
    return prisma.resource.findMany({
      where: all === "1" ? undefined : { active: true },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  });

  const resourceSchema = z.object({
    name: z.string().trim().min(1),
    type: z.enum(["LIFT", "MECHANIC", "BAY"]),
    jobTitle: z.string().trim().max(120).optional(),
    skillLevel: z.coerce.number().int().min(0).max(3),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
    workMinutesPerDay: z.coerce.number().int().min(0).max(1440).optional(),
  });

  app.post(
    "/resources",
    async (req, reply) => {
      const data = resourceSchema.parse(req.body);
      // Neue Arbeitsplätze/Mechaniker hinten anreihen, damit die Spaltenreihenfolge
      // im Planer der Bedien-Reihenfolge folgt.
      const last = await prisma.resource.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const resource = await prisma.resource.create({
        data: { ...data, sortOrder: data.sortOrder ?? (last?.sortOrder ?? 0) + 1 },
      });
      await audit(req.user!.id, "CREATE", "Resource", resource.id, { name: resource.name, type: resource.type });
      return resource;
    }
  );

  app.put("/resources/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = resourceSchema.partial().parse(req.body);
    const existing = await prisma.resource.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Arbeitsplatz nicht gefunden" });
    const resource = await prisma.resource.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Resource", id, { name: resource.name, active: resource.active });
    return resource;
  });

  // Kein Hard-Delete: Termine und Aufträge referenzieren die Ressource.
  // Deaktivieren blendet sie im Planer aus, die Historie bleibt.
  app.delete("/resources/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.resource.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return reply.code(404).send({ error: "Arbeitsplatz nicht gefunden" });
    const resource = await prisma.resource.update({ where: { id }, data: { active: false } });
    await audit(req.user!.id, "ARCHIVE", "Resource", id, { name: existing.name });
    return resource;
  });

  // ── Termine ──
  // Range: ?from=ISO&to=ISO (Kalenderausschnitt) optional resourceId
  app.get("/appointments", async (req) => {
    const { from, to, resourceId, open } = (req.query ?? {}) as { from?: string; to?: string; resourceId?: string; open?: string };
    const where: Record<string, unknown> = {};
    if (from || to) {
      where.start = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    }
    if (resourceId) where.resourceId = resourceId;
    if (open === "1") where.workOrder = { is: null }; // nur Termine ohne Auftrag (für Übernahme)
    return prisma.appointment.findMany({
      where,
      orderBy: { start: "asc" },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, company: true, phone: true } },
        vehicle: { select: { id: true, licensePlate: true, brand: true, model: true } },
        resource: { select: { id: true, name: true, type: true, jobTitle: true, skillLevel: true } },
        mechanic: { select: { id: true, name: true, jobTitle: true, skillLevel: true } },
        workOrder: { select: { id: true, number: true, status: true } },
      },
    });
  });

  // ── Auto-Verplanung: freie Slots vorschlagen ──
  // Sucht chronologisch die ersten freien Kombinationen aus Bühne + qualifiziertem
  // Mechaniker. Öffnungszeiten kommen aus den Settings und gelten in Werkstatt-
  // Lokalzeit (Europe/Zurich) — nicht in UTC des Containers.
  const SUGGEST_MAX = 5;
  const SUGGEST_MAX_DAYS = 14;
  const GRID_MIN = 15;

  app.get("/appointments/suggest", async (req) => {
    const q = z.object({
      durationMin: z.coerce.number().int().min(15).max(600),
      requiredSkill: z.coerce.number().int().min(0).max(3).default(0),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      stationId: z.string().optional(),
      mechanicId: z.string().optional(),
    }).parse(req.query ?? {});

    const settings = await getSettings();
    const now = new Date();
    const from = q.from ?? now;
    const to = q.to ?? new Date(from.getTime() + SUGGEST_MAX_DAYS * 86_400_000);
    const minStart = from < now ? now : from;

    const stations = await prisma.resource.findMany({
      where: { active: true, type: { not: "MECHANIC" }, ...(q.stationId ? { id: q.stationId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const mechanics = await prisma.resource.findMany({
      where: { active: true, type: "MECHANIC", skillLevel: { gte: Math.max(q.requiredSkill, 1) }, ...(q.mechanicId ? { id: q.mechanicId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    if (stations.length === 0 || mechanics.length === 0) return { suggestions: [] };

    const { byResource, byMechanic } = await busyFor(stations.map((s) => s.id), mechanics.map((m) => m.id), from, to);

    // Auslastung pro Mechaniker und Tag — für das Ranking (weniger belastet zuerst).
    const mechDayLoad = new Map<string, number>();
    for (const [mid, spans] of byMechanic) {
      for (const b of spans) {
        const key = `${mid}|${zonedDayKey(b.start)}`;
        mechDayLoad.set(key, (mechDayLoad.get(key) ?? 0) + (b.end.getTime() - b.start.getTime()) / 60_000);
      }
    }

    interface Suggestion {
      start: Date;
      end: Date;
      resourceId: string;
      resourceName: string;
      mechanicId: string;
      mechanicName: string;
      mechanicLoadMin: number;
    }
    const suggestions: Suggestion[] = [];

    let dayKey = zonedDayKey(minStart);
    for (let i = 0; i < SUGGEST_MAX_DAYS && suggestions.length < SUGGEST_MAX * 3; i++) {
      const dow = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
      const closed = dow === 0 || (dow === 6 && !settings.saturdayOpen);
      if (!closed) {
        for (let m = settings.shopStartMin; m + q.durationMin <= settings.shopEndMin; m += GRID_MIN) {
          if (suggestions.length >= SUGGEST_MAX * 3) break;
          const start = zonedMake(dayKey, m);
          const end = zonedMake(dayKey, m + q.durationMin);
          if (start < minStart) continue;
          const freeMechs = mechanics.filter((mm) => !overlaps(byMechanic.get(mm.id), start, end));
          if (freeMechs.length === 0) continue;
          const best = freeMechs.sort(
            (a, b) =>
              (mechDayLoad.get(`${a.id}|${dayKey}`) ?? 0) - (mechDayLoad.get(`${b.id}|${dayKey}`) ?? 0) ||
              a.name.localeCompare(b.name, "de"),
          )[0];
          const station = stations.find((st) => !overlaps(byResource.get(st.id), start, end));
          if (!station) continue;
          suggestions.push({
            start,
            end,
            resourceId: station.id,
            resourceName: station.name,
            mechanicId: best.id,
            mechanicName: best.name,
            mechanicLoadMin: Math.round(mechDayLoad.get(`${best.id}|${dayKey}`) ?? 0),
          });
        }
      }
      dayKey = addZonedDays(dayKey, 1);
    }

    suggestions.sort((a, b) => a.start.getTime() - b.start.getTime() || a.mechanicLoadMin - b.mechanicLoadMin);
    return { suggestions: suggestions.slice(0, SUGGEST_MAX) };
  });

  app.post("/appointments", async (req, reply) => {
    const data = appointmentSchema.parse(req.body);
    let resourceId = data.resourceId;
    let mechanicId = data.mechanicId;

    // Auto-Verplanung: fehlende Bühne/Mechaniker automatisch wählen — am wenigsten
    // belastete Ressource, die im Slot frei ist und die Qualifikation erfüllt.
    if (data.autoAssign && (!resourceId || !mechanicId)) {
      const stations = await prisma.resource.findMany({ where: { active: true, type: { not: "MECHANIC" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
      const mechanics = await prisma.resource.findMany({
        where: { active: true, type: "MECHANIC", skillLevel: { gte: Math.max(data.requiredSkill, 1) } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      const { byResource, byMechanic } = await busyFor(stations.map((s) => s.id), mechanics.map((m) => m.id), data.start, data.end);
      if (!mechanicId) mechanicId = leastBusy(byMechanic, mechanics, data.start, data.end)?.id;
      if (!resourceId) resourceId = leastBusy(byResource, stations, data.start, data.end)?.id;
    }

    const conflicts = await findConflicts(resourceId, mechanicId, data.start, data.end);
    if (conflicts.length > 0) {
      return reply.code(409).send({
        error: "Bühne oder Person ist in diesem Zeitraum bereits belegt",
        canOverride: req.user!.role === "ADMIN",
        conflicts,
      });
    }
    const { autoAssign: _aa, override: _ov, ...dataClean } = data;
    const appointment = await prisma.appointment.create({
      data: { ...dataClean, resourceId: resourceId ?? null, mechanicId: mechanicId ?? null },
    });
    await audit(req.user!.id, "CREATE", "Appointment", appointment.id, { start: data.start, autoAssign: !!data.autoAssign });
    return appointment;
  });

  app.put("/appointments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateSchema.parse(req.body);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });
    const start = data.start ?? existing.start;
    const end = data.end ?? existing.end;
    const resourceId = data.resourceId !== undefined ? data.resourceId : existing.resourceId ?? undefined;
    const mechanicId = data.mechanicId !== undefined ? data.mechanicId : existing.mechanicId ?? undefined;
    const conflicts = await findConflicts(resourceId, mechanicId, start, end, id);
    const override = (data as { override?: boolean }).override === true && req.user!.role === "ADMIN";
    if (conflicts.length > 0 && !override) {
      return reply.code(409).send({
        error: "Bühne oder Person ist in diesem Zeitraum bereits belegt",
        canOverride: req.user!.role === "ADMIN",
        conflicts,
      });
    }
    if (conflicts.length > 0 && override) await audit(req.user!.id, "OVERRIDE", "Appointment", id, { conflict: true });
    const { autoAssign: _aa, override: _ov, ...dataClean } = data as typeof data & { override?: boolean; autoAssign?: boolean };
    const appointment = await prisma.appointment.update({ where: { id }, data: { ...dataClean, resourceId: resourceId ?? null, mechanicId: mechanicId ?? null } });
    await audit(req.user!.id, "UPDATE", "Appointment", id, { status: appointment.status });
    return appointment;
  });

  app.delete("/appointments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.appointment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });
    const appointment = await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(req.user!.id, "CANCEL", "Appointment", id);
    return appointment;
  });
}

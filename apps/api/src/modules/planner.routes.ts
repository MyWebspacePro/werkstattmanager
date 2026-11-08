import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const appointmentFields = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  resourceId: z.string().optional(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["REQUESTED", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"]).default("CONFIRMED"),
  requiredSkill: z.coerce.number().int().min(0).max(3).default(0),
});

const appointmentSchema = appointmentFields.refine((d) => d.end > d.start, {
  message: "Ende muss nach Start liegen",
  path: ["end"],
});

const updateSchema = appointmentFields.partial().refine((d) => !d.start || !d.end || d.end > d.start, {
  message: "Ende muss nach Start liegen",
  path: ["end"],
});

async function hasConflict(resourceId: string | undefined, start: Date, end: Date, excludeId?: string) {
  if (!resourceId) return false;
  const count = await prisma.appointment.count({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      resourceId,
      status: { notIn: ["CANCELLED"] },
      start: { lt: end },
      end: { gt: start },
    },
  });
  return count > 0;
}

export async function plannerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // ── Ressourcen (Hebebühnen, Mechaniker, Plätze) ──
  app.get("/resources", async () =>
    prisma.resource.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] })
  );

  app.post(
    "/resources",
    { preHandler: authGuard },
    async (req) => {
      const data = z
        .object({ name: z.string().min(1), type: z.enum(["LIFT", "MECHANIC", "BAY"]).default("LIFT") })
        .parse(req.body);
      const resource = await prisma.resource.create({ data });
      await audit(req.user!.id, "CREATE", "Resource", resource.id, { name: resource.name });
      return resource;
    }
  );

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
        resource: { select: { id: true, name: true, jobTitle: true, skillLevel: true } },
        workOrder: { select: { id: true, number: true, status: true } },
      },
    });
  });

  app.post("/appointments", async (req, reply) => {
    const data = appointmentSchema.parse(req.body);
    if (await hasConflict(data.resourceId, data.start, data.end)) {
      return reply.code(409).send({ error: "Ressource ist in diesem Zeitraum bereits belegt" });
    }
    const appointment = await prisma.appointment.create({ data });
    await audit(req.user!.id, "CREATE", "Appointment", appointment.id, { start: data.start });
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
    if (await hasConflict(resourceId, start, end, id)) {
      return reply.code(409).send({ error: "Ressource ist in diesem Zeitraum bereits belegt" });
    }
    const appointment = await prisma.appointment.update({ where: { id }, data: { ...data, resourceId: resourceId ?? null } });
    await audit(req.user!.id, "UPDATE", "Appointment", id, { status: appointment.status });
    return appointment;
  });

  app.delete("/appointments/:id", async (req) => {
    const { id } = req.params as { id: string };
    const appointment = await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(req.user!.id, "CANCEL", "Appointment", id);
    return appointment;
  });
}

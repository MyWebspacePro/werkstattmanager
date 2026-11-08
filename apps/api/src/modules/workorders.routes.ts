import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { nextDocNumber } from "../lib/numbers.js";
import { computeTotals } from "../lib/money.js";

const lineSchema = z.object({
  type: z.enum(["LABOR", "PART", "EXTERNAL", "FLAT"]).default("FLAT"),
  description: z.string().min(1),
  qty: z.coerce.number().min(0).default(1),
  unit: z.string().default("x"),
  unitPrice: z.coerce.number().min(0).default(0),
  vatRate: z.coerce.number().min(0).max(30).default(8.1),
  partId: z.string().optional(),
});

const orderBody = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  appointmentId: z.string().optional(),
  resourceId: z.string().nullable().optional(),
  requiredSkill: z.coerce.number().int().min(1).max(3).default(1),
  reportedIssues: z.string().optional(),
  internalNotes: z.string().optional(),
  lines: z.array(lineSchema).default([]),
});

const statusValues = ["OPEN", "PARTS_ORDERED", "IN_PROGRESS", "READY", "INVOICED", "PAID", "CANCELLED"] as const;
const statusSchema = z.object({ status: z.enum(statusValues) });

export const orderInclude = {
  lines: { orderBy: { position: "asc" as const } },
  customer: true,
  vehicle: true,
  quote: { select: { id: true, number: true } },
  resource: { select: { id: true, name: true, jobTitle: true, skillLevel: true } },
  timeEntries: { orderBy: { startedAt: "asc" as const }, include: { user: { select: { id: true, name: true } } } },
  appointment: { select: { id: true, start: true } },
  photos: true,
  loans: { where: { status: "OPEN" as const } },
  invoices: { select: { id: true, number: true, status: true, total: true } },
};

export async function workOrderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/workorders", async (req) => {
    const { status, q, skip = 0, take = 25, open } = (req.query ?? {}) as {
      status?: string; q?: string; skip?: number; take?: number; open?: string;
    };
    const where: Record<string, unknown> = { archived: false };
    if (status) where.status = status;
    if (open === "true") where.status = { in: ["OPEN", "PARTS_ORDERED", "IN_PROGRESS", "READY"] };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } },
        { vehicle: { licensePlate: { contains: q, mode: "insensitive" } } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        orderBy: { openedAt: "desc" },
        skip: Number(skip),
        take: Math.min(Number(take), 100),
        include: {
          customer: { select: { firstName: true, lastName: true, company: true } },
          vehicle: { select: { licensePlate: true, brand: true, model: true } },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/workorders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await prisma.workOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    return order;
  });

  app.post("/workorders", async (req) => {
    const body = orderBody.parse(req.body);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const totals = computeTotals(body.lines, settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD");

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
        data: {
          number: await nextDocNumber("order"),
          customerId: body.customerId,
          vehicleId: body.vehicleId,
          appointmentId: body.appointmentId ?? null,
          resourceId: body.resourceId ?? null,
          requiredSkill: body.requiredSkill,
          reportedIssues: body.reportedIssues,
          internalNotes: body.internalNotes,
          laborRate: settings.defaultLaborRate,
          plannedNet: totals.net,
          lines: { create: body.lines.map((l, i) => ({ ...l, partId: l.partId ?? null, position: i })) },
        },
      });
      // Teile bei PART-Positionen sofort aus dem Lager abbuchen
      for (const line of body.lines) {
        if (line.type === "PART" && line.partId) {
          await tx.part.update({
            where: { id: line.partId },
            data: { stock: { decrement: Math.round(Number(line.qty)) } },
          });
          await tx.stockMovement.create({
            data: { partId: line.partId, type: "OUT", qty: Math.round(Number(line.qty)), reason: `Auftrag ${created.number}`, orderId: created.id, userId: req.user!.id },
          });
        }
      }
      if (body.appointmentId) {
        // Verknüpfung läuft über WorkOrder.appointmentId (bereits gesetzt)
      }
      return created;
    });
    await audit(req.user!.id, "CREATE", "WorkOrder", order.id, { number: order.number });
    return order;
  });

  app.put("/workorders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = orderBody.partial().parse(req.body);
    const existing = await prisma.workOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!existing) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    // Statusschutz: fakturierte/abgeschlossene Aufträge sind gesperrt (Rechnung wäre sonst ein falscher Snapshot)
    if (["INVOICED", "PAID", "CANCELLED"].includes(existing.status)) {
      return reply.code(409).send({ error: `Auftrag ist ${existing.status} und damit gesperrt — Korrekturen nur über Kreditnota` });
    }
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });

    await prisma.$transaction(async (tx) => {
      const { lines, ...data } = body;
      await tx.workOrder.update({ where: { id }, data });
      if (lines) {
        // Entfernte PART-Positionen zurück ins Lager
        const newPartIds = new Set(lines.filter((l) => l.partId && l.type === "PART").map((l) => l.partId));
        for (const old of existing.lines) {
          if (old.type === "PART" && old.partId && !newPartIds.has(old.partId)) {
            await tx.part.update({ where: { id: old.partId }, data: { stock: { increment: Math.round(Number(old.qty)) } } });
            await tx.stockMovement.create({
              data: { partId: old.partId, type: "IN", qty: Math.round(Number(old.qty)), reason: `Rücklage Auftrag ${existing.number}`, orderId: id, userId: req.user!.id },
            });
          }
        }
        await tx.workOrderLine.deleteMany({ where: { orderId: id } });
        await tx.workOrderLine.createMany({
          data: lines.map((l, i) => ({ ...l, partId: l.partId ?? null, orderId: id, position: i })),
        });
        // Neue PART-Positionen abbuchen
        const oldPartIds = new Set(existing.lines.filter((l) => l.partId).map((l) => l.partId));
        for (const line of lines) {
          if (line.type === "PART" && line.partId && !oldPartIds.has(line.partId)) {
            await tx.part.update({ where: { id: line.partId }, data: { stock: { decrement: Math.round(Number(line.qty)) } } });
            await tx.stockMovement.create({
              data: { partId: line.partId, type: "OUT", qty: Math.round(Number(line.qty)), reason: `Auftrag ${existing.number}`, orderId: id, userId: req.user!.id },
            });
          }
        }
      }
    });

    // Nachkalkulation: effektiver Nettowert der Positionen
    const final = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const totals = computeTotals(final.lines, settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD");
    await prisma.workOrder.update({ where: { id }, data: { actualNet: totals.net } });
    await audit(req.user!.id, "UPDATE", "WorkOrder", id, { number: final.number });
    return prisma.workOrder.findUnique({ where: { id }, include: orderInclude });
  });


  // ── Zeiterfassung pro Auftrag ──
  app.post("/workorders/:id/time", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      minutes: z.coerce.number().int().min(1).max(24 * 60),
      note: z.string().optional(),
      userId: z.string().optional(), // nur ADMIN darf für andere buchen
      startedAt: z.coerce.date().optional(),
    }).parse(req.body);
    const order = await prisma.workOrder.findUnique({ where: { id } });
    if (!order) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    if (["INVOICED", "PAID", "CANCELLED"].includes(order.status)) {
      return reply.code(409).send({ error: `Auftrag ist ${order.status} — keine Zeitbuchung mehr möglich` });
    }
    const entry = await prisma.timeEntry.create({
      data: {
        orderId: id,
        userId: body.userId && req.user!.role === "ADMIN" ? body.userId : req.user!.id,
        minutes: body.minutes, note: body.note, startedAt: body.startedAt ?? new Date(),
      },
      include: { user: { select: { id: true, name: true } } },
    });
    await audit(req.user!.id, "TIME", "WorkOrder", id, { minutes: body.minutes });
    return entry;
  });

  app.delete("/workorders/:id/time/:entryId", async (req, reply) => {
    const { id, entryId } = req.params as { id: string; entryId: string };
    const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.orderId !== id) return reply.code(404).send({ error: "Zeiteintrag nicht gefunden" });
    if (req.user!.role !== "ADMIN" && entry.userId !== req.user!.id) {
      return reply.code(403).send({ error: "Nur der eigene Eintrag oder Chef darf löschen" });
    }
    await prisma.timeEntry.delete({ where: { id: entryId } });
    await audit(req.user!.id, "TIME_DELETE", "WorkOrder", id);
    return { ok: true };
  });

  app.patch("/workorders/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = statusSchema.parse(req.body);
    const current = await prisma.workOrder.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    // Reopening blockieren: nur INVOICED → PAID ist erlaubt, sonst nichts aus abgeschlossenen Zuständen raus
    if (["INVOICED", "PAID", "CANCELLED"].includes(current.status)) {
      const allowed = current.status === "INVOICED" && status === "PAID";
      if (!allowed) {
        return reply.code(409).send({ error: `Auftrag ist ${current.status} — Status kann nur über Kreditnota/Storno geändert werden` });
      }
    }
    const closing = status === "INVOICED" || status === "PAID" || status === "CANCELLED";
    const order = await prisma.workOrder.update({
      where: { id },
      data: { status, closedAt: closing ? new Date() : null },
    });
    await audit(req.user!.id, "STATUS", "WorkOrder", id, { status });
    return order;
  });
}

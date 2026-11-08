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

const quoteBody = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).default([]),
});

async function recalcTotals(quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: true } });
  const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  const totals = computeTotals(
    quote.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, vatRate: l.vatRate })),
    settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD"
  );
  return prisma.quote.update({
    where: { id: quoteId },
    data: { totalNet: totals.net, totalVat: totals.vat, total: totals.total },
  });
}

export async function quoteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/quotes", async (req) => {
    const { status, skip = 0, take = 25 } = (req.query ?? {}) as { status?: string; skip?: number; take?: number };
    const where: Record<string, unknown> = { archived: false };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(skip),
        take: Math.min(Number(take), 100),
        include: {
          customer: { select: { firstName: true, lastName: true, company: true } },
          vehicle: { select: { licensePlate: true, brand: true, model: true } },
        },
      }),
      prisma.quote.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/quotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: "asc" } },
        customer: true,
        vehicle: true,
        workOrder: { select: { id: true, number: true } },
      },
    });
    if (!quote) return reply.code(404).send({ error: "Kostenvoranschlag nicht gefunden" });
    return quote;
  });

  app.post("/quotes", async (req) => {
    const body = quoteBody.parse(req.body);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const totals = computeTotals(body.lines, settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD");
    const quote = await prisma.quote.create({
      data: {
        number: await nextDocNumber("quote"),
        customerId: body.customerId,
        vehicleId: body.vehicleId,
        validUntil: body.validUntil,
        notes: body.notes,
        totalNet: totals.net,
        totalVat: totals.vat,
        total: totals.total,
        lines: {
          create: body.lines.map((l, i) => ({ ...l, partId: l.partId ?? null, position: i })),
        },
      },
      include: { lines: true },
    });
    await audit(req.user!.id, "CREATE", "Quote", quote.id, { number: quote.number });
    return quote;
  });

  app.put("/quotes/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = quoteBody.partial().parse(req.body);
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    await prisma.$transaction(async (tx) => {
      const { lines, ...data } = body;
      if (data.validUntil !== undefined) data.validUntil = data.validUntil || null;
      await tx.quote.update({ where: { id }, data });
      if (lines) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        await tx.quoteLine.createMany({
          data: lines.map((l, i) => ({ ...l, partId: l.partId ?? null, quoteId: id, position: i })),
        });
      }
    });
    const quote = await recalcTotals(id);
    await audit(req.user!.id, "UPDATE", "Quote", id, { number: quote.number });
    return quote;
  });

  // Statusübergänge
  app.post("/quotes/:id/:action(send|accept|reject)", async (req, reply) => {
    const { id, action } = req.params as { id: string; action: "send" | "accept" | "reject" };
    const body = (req.body ?? {}) as { rejectionReason?: string };
    const data =
      action === "send"
        ? { status: "SENT" as const }
        : action === "accept"
          ? { status: "ACCEPTED" as const, acceptedAt: new Date() }
          : { status: "REJECTED" as const, rejectedAt: new Date(), rejectionReason: body.rejectionReason ?? "" };
    try {
      const quote = await prisma.quote.update({ where: { id }, data });
      await audit(req.user!.id, action.toUpperCase(), "Quote", id);
      return quote;
    } catch {
      return reply.code(404).send({ error: "Kostenvoranschlag nicht gefunden" });
    }
  });

  // Akzeptierten KV in Auftrag umwandeln
  app.post("/quotes/:id/convert", async (req, reply) => {
    const { id } = req.params as { id: string };
    const quote = await prisma.quote.findUnique({ where: { id }, include: { lines: true, workOrder: { select: { id: true } } } });
    if (!quote) return reply.code(404).send({ error: "Kostenvoranschlag nicht gefunden" });
    if (quote.status !== "ACCEPTED") {
      return reply.code(400).send({ error: "Nur akzeptierte Kostenvoranschläge können umgewandelt werden" });
    }
    if (quote.workOrder) return reply.code(409).send({ error: "Auftrag existiert bereits", workOrderId: quote.workOrder.id });

    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const workOrder = await prisma.workOrder.create({
      data: {
        number: await nextDocNumber("order"),
        customerId: quote.customerId,
        vehicleId: quote.vehicleId,
        quoteId: quote.id,
        laborRate: settings.defaultLaborRate,
        reportedIssues: quote.notes,
        plannedNet: quote.totalNet,
        lines: {
          create: quote.lines.map((l, i) => ({
            type: l.type,
            description: l.description,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            partId: l.partId,
            position: i,
          })),
        },
      },
    });
    await audit(req.user!.id, "CONVERT", "Quote", id, { workOrderNumber: workOrder.number });
    return workOrder;
  });
}

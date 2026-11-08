import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { computeTotals } from "../lib/money.js";

const loanerSchema = z.object({
  plate: z.string().min(2),
  brand: z.string().min(1),
  model: z.string().min(1),
  dailyRate: z.coerce.number().min(0).default(40),
  odometer: z.coerce.number().int().min(0).default(0),
  status: z.enum(["AVAILABLE", "LOANED", "MAINTENANCE", "RETIRED"]).default("AVAILABLE"),
  notes: z.string().optional(),
});

const loanSchema = z.object({
  loanerId: z.string().min(1),
  customerId: z.string().min(1),
  vehicleId: z.string().optional(),
  orderId: z.string().optional(),
  dueAt: z.coerce.date(),
  startOdo: z.coerce.number().int().min(0).optional(),
});

export async function loanerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // Flotte mit aktiven Ausleihen
  app.get("/loaners", async () => {
    const items = await prisma.loanerVehicle.findMany({
      orderBy: { plate: "asc" },
      include: { loans: { where: { status: "OPEN" }, include: { customer: { select: { firstName: true, lastName: true, company: true } } } } },
    });
    return items;
  });

  app.post("/loaners", async (req) => {
    const data = loanerSchema.parse(req.body);
    const loaner = await prisma.loanerVehicle.create({ data });
    await audit(req.user!.id, "CREATE", "LoanerVehicle", loaner.id, { plate: loaner.plate });
    return loaner;
  });

  app.put("/loaners/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = loanerSchema.partial().parse(req.body);
    const loaner = await prisma.loanerVehicle.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "LoanerVehicle", id);
    return loaner;
  });

  // Alle Ausleihen (Historie)
  app.get("/loans", async () => {
    return prisma.loan.findMany({
      orderBy: { outAt: "desc" },
      take: 100,
      include: {
        loaner: { select: { plate: true, brand: true, model: true } },
        customer: { select: { firstName: true, lastName: true, company: true } },
      },
    });
  });

  // Leihwagen herausgeben
  app.post("/loans", async (req, reply) => {
    const body = loanSchema.parse(req.body);
    const loaner = await prisma.loanerVehicle.findUnique({ where: { id: body.loanerId }, include: { loans: { where: { status: "OPEN" } } } });
    if (!loaner) return reply.code(404).send({ error: "Leihwagen nicht gefunden" });
    if (loaner.loans.length > 0) return reply.code(409).send({ error: `${loaner.plate} ist bereits verliehen` });
    if (loaner.status !== "AVAILABLE") return reply.code(409).send({ error: `${loaner.plate} ist nicht verfügbar (${loaner.status})` });

    const loan = await prisma.$transaction(async (tx) => {
      const created = await tx.loan.create({
        data: {
          loanerId: body.loanerId, customerId: body.customerId, vehicleId: body.vehicleId || null,
          orderId: body.orderId || null, dueAt: body.dueAt, startOdo: body.startOdo ?? loaner.odometer,
          dailyRate: loaner.dailyRate,
        },
      });
      await tx.loanerVehicle.update({ where: { id: body.loanerId }, data: { status: "LOANED" } });
      return created;
    });
    // Tagespauschale als Position auf den Auftrag (wenn verknüpft und nicht fakturiert)
    let lineWarning: string | undefined;
    if (body.orderId) {
      const order = await prisma.workOrder.findUnique({ where: { id: body.orderId }, include: { lines: true } });
      if (!order) lineWarning = "Verknüpfter Auftrag nicht gefunden";
      else if (["INVOICED", "PAID", "CANCELLED"].includes(order.status)) lineWarning = `Auftrag ${order.number} ist ${order.status} — Leihwagen-Pauschale wurde NICHT gebucht`;
      else {
        const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
        await prisma.workOrderLine.create({
          data: {
            orderId: order.id, type: "EXTERNAL",
            description: `Leihwagen ${loaner.brand} ${loaner.model} (${loaner.plate})`,
            qty: 1, unit: "Tag", unitPrice: Number(loaner.dailyRate),
            vatRate: Number(settings.vatRateStandard), position: order.lines.length,
          },
        });
        await recomputeOrderNet(order.id);
      }
    }
    await audit(req.user!.id, "CREATE", "Loan", loan.id, { plate: loaner.plate });
    return { ...loan, lineWarning };
  });

  /** Nachkalkulation eines Auftrags nach direkten Positionsänderungen. */
  async function recomputeOrderNet(orderId: string) {
    const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    const totals = computeTotals(order.lines, settings.vatScheme === "SMALL_BUSINESS" ? "SMALL_BUSINESS" : "STANDARD");
    await prisma.workOrder.update({ where: { id: orderId }, data: { actualNet: totals.net } });
  }

  // Rückgabe: KM + Status updaten
  app.post("/loans/:id/return", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ endOdo: z.coerce.number().int().min(0).optional(), note: z.string().optional() }).parse(req.body ?? {});
    const loan = await prisma.$transaction(async (tx) => {
      const existing = await tx.loan.findUniqueOrThrow({ where: { id }, include: { loaner: true } });
      const updated = await tx.loan.update({
        where: { id },
        data: { status: "RETURNED", returnedAt: new Date(), endOdo: body.endOdo ?? existing.startOdo },
      });
      await tx.loanerVehicle.update({
        where: { id: existing.loanerId },
        data: { status: "AVAILABLE", odometer: body.endOdo ?? existing.loaner.odometer },
      });
      // Tagespauschale auf der Auftragsposition: Anzahl Tage nachträglich
      if (existing.orderId) {
        const days = Math.max(1, Math.ceil((Date.now() - new Date(existing.outAt).getTime()) / 86400000));
        const line = await tx.workOrderLine.findFirst({
          where: { orderId: existing.orderId, type: "EXTERNAL", description: { startsWith: "Leihwagen" } },
        });
        if (line) await tx.workOrderLine.update({ where: { id: line.id }, data: { qty: days } });
        await recomputeOrderNet(existing.orderId);
      }
      return updated;
    });
    await audit(req.user!.id, "RETURN", "Loan", id);
    return loan;
  });
}

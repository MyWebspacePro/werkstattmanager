import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const purchaseSchema = z.object({
  sellerId: z.string().min(1),
  vehicleId: z.string().optional(),
  vin: z.string().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  mileage: z.coerce.number().int().min(0).optional(),
  evaluationNotes: z.string().optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  prepCosts: z.coerce.number().min(0).optional(),
  status: z.enum(["EVALUATION", "ACQUIRED", "PREPARING", "LISTED", "SOLD"]).default("EVALUATION"),
});

export async function salesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/purchases", async (req) => {
    const { status } = (req.query ?? {}) as { status?: string };
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const items = await prisma.purchaseVehicle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { seller: { select: { firstName: true, lastName: true, company: true } }, vehicle: { select: { licensePlate: true } } },
    });
    return { items };
  });

  app.get("/purchases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await prisma.purchaseVehicle.findUnique({ where: { id }, include: { seller: true, vehicle: true } });
    if (!item) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    return item;
  });

  app.post("/purchases", async (req) => {
    const { vehicleId, purchasePrice, ...data } = purchaseSchema.parse(req.body);
    const item = await prisma.purchaseVehicle.create({
      data: { ...data, vehicleId: vehicleId || null, purchasePrice: purchasePrice ?? null, purchaseDate: data.status !== "EVALUATION" ? new Date() : null },
    });
    await audit(req.user!.id, "CREATE", "PurchaseVehicle", item.id, { brand: item.brand });
    return item;
  });

  app.put("/purchases/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = purchaseSchema.partial().parse(req.body);
    const { vehicleId, purchasePrice, salePrice, prepCosts, status, ...data } = body;
    const existing = await prisma.purchaseVehicle.findUniqueOrThrow({ where: { id } });
    const item = await prisma.purchaseVehicle.update({
      where: { id },
      data: {
        ...data,
        vehicleId: vehicleId || undefined,
        purchasePrice: purchasePrice ?? undefined,
        salePrice: salePrice ?? undefined,
        prepCosts: prepCosts ?? undefined,
        status,
        purchaseDate: existing.purchaseDate ?? (status && status !== "EVALUATION" ? new Date() : undefined),
        saleDate: status === "SOLD" ? (existing.saleDate ?? new Date()) : existing.saleDate,
      },
    });
    await audit(req.user!.id, "UPDATE", "PurchaseVehicle", id, { status: item.status });
    return item;
  });

  // Marge-Übersicht: Ankaufskosten + Aufbereitung vs. Verkaufspreis
  app.get("/purchases/summary/margin", async () => {
    const items = await prisma.purchaseVehicle.findMany({ where: { status: "SOLD" } });
    const totalPurchase = items.reduce((s, i) => s + Number(i.purchasePrice ?? 0) + Number(i.prepCosts), 0);
    const totalSales = items.reduce((s, i) => s + Number(i.salePrice ?? 0), 0);
    return { soldCount: items.length, totalPurchase, totalSales, margin: totalSales - totalPurchase };
  });
}

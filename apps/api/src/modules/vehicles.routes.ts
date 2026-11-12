import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const vehicleSchema = z.object({
  customerId: z.string().min(1),
  licensePlate: z.string().trim().min(1),
  vin: z.string().optional(),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  mileage: z.coerce.number().int().min(0).optional(),
  fuel: z.string().optional(),
  notes: z.string().optional(),
});

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/vehicles", async (req) => {
    const { q, skip = 0, take = 50 } = (req.query ?? {}) as { q?: string; skip?: number; take?: number };
    const where: Record<string, unknown> = { archived: false };
    if (q) {
      where.OR = [
        { licensePlate: { contains: q, mode: "insensitive" } },
        { vin: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        orderBy: { licensePlate: "asc" },
        skip: Number(skip),
        take: Math.min(Number(take), 100),
        include: { customer: { select: { id: true, firstName: true, lastName: true, company: true } } },
      }),
      prisma.vehicle.count({ where }),
    ]);
    return { items, total };
  });

  app.get("/vehicles/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        customer: true,
        workOrders: { orderBy: { openedAt: "desc" }, include: { lines: true } },
        invoices: { orderBy: { date: "desc" }, take: 20 },
        tyreSets: { where: { retrievedAt: null } },
        reminderRules: { where: { active: true } },
      },
    });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    return vehicle;
  });

  app.post("/vehicles", async (req) => {
    const data = vehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.create({ data });
    await audit(req.user!.id, "CREATE", "Vehicle", vehicle.id, { plate: vehicle.licensePlate });
    return vehicle;
  });

  app.put("/vehicles/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { customerId, ...data } = vehicleSchema.parse(req.body);
    const existing = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const vehicle = await prisma.vehicle.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Vehicle", id, { plate: vehicle.licensePlate, mileage: vehicle.mileage });
    return vehicle;
  });

  // Bewusst für ADMIN + STAFF (siehe AGENTS.md / customers.routes.ts).
  app.delete("/vehicles/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const vehicle = await prisma.vehicle.update({ where: { id }, data: { archived: true } });
    await audit(req.user!.id, "ARCHIVE", "Vehicle", id);
    return vehicle;
  });
}

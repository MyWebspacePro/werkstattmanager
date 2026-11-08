import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const tyreSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().optional(),
  slotCode: z.string().min(1),
  season: z.enum(["SUMMER", "WINTER", "ALLSEASON"]),
  inches: z.coerce.number().int().min(10).max(24).optional(),
  seasonFee: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export async function tyreRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // Alle eingelagerten Sätze (aktive Lagerung)
  app.get("/tyres", async (req) => {
    const { stored = "true" } = (req.query ?? {}) as { stored?: string };
    const where = stored === "true" ? { retrievedAt: null } : {};
    const items = await prisma.tyreSet.findMany({
      where,
      orderBy: { storedAt: "desc" },
      include: {
        customer: { select: { firstName: true, lastName: true, company: true, phone: true, email: true } },
        vehicle: { select: { licensePlate: true, brand: true, model: true } },
      },
    });
    return { items, total: items.length };
  });

  app.post("/tyres", async (req, reply) => {
    const { vehicleId, ...data } = tyreSchema.parse(req.body);
    const existingSlot = await prisma.tyreSet.findUnique({ where: { slotCode: data.slotCode } });
    if (existingSlot && !existingSlot.retrievedAt) {
      return reply.code(409).send({ error: `Lagerplatz ${data.slotCode} ist belegt` });
    }
    if (existingSlot) {
      // Platz war belegt, ist aber ausgelagert → alter Datensatz bleibt (Historie), Platz frei
    }
    const tyre = await prisma.tyreSet.create({ data: { ...data, vehicleId: vehicleId || null } });
    await audit(req.user!.id, "CREATE", "TyreSet", tyre.id, { slot: tyre.slotCode });
    return tyre;
  });

  // Auslagern (Retrieval); optional als Position auf Auftrag? MVP: nur Auslagerung
  app.post("/tyres/:id/retrieve", async (req) => {
    const { id } = req.params as { id: string };
    const tyre = await prisma.tyreSet.update({ where: { id }, data: { retrievedAt: new Date() } });
    await audit(req.user!.id, "RETRIEVE", "TyreSet", id, { slot: tyre.slotCode });
    return tyre;
  });

  app.put("/tyres/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { vehicleId, ...data } = tyreSchema.partial().parse(req.body);
    const tyre = await prisma.tyreSet.update({ where: { id }, data: { ...data, vehicleId: vehicleId || undefined } });
    await audit(req.user!.id, "UPDATE", "TyreSet", id);
    return tyre;
  });

  // Saisonerinnerung: Kunden mit eingelagerten Sätzen, gruppiert (Basis für E-Mail-Kampagne)
  app.get("/tyres/reminders", async () => {
    const stored = await prisma.tyreSet.findMany({
      where: { retrievedAt: null },
      include: { customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true, consents: true } } },
    });
    const map = new Map<string, { customerId: string; name: string; email?: string | null; marketingAllowed: boolean; slots: string[]; count: number }>();
    for (const t of stored) {
      const c = t.customer;
      const name = c.company ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const entry = map.get(c.id) ?? {
        customerId: c.id, name, email: c.email,
        marketingAllowed: c.consents.some((x) => x.type === "EMAIL_MARKETING" && x.granted),
        slots: [], count: 0,
      };
      entry.slots.push(t.slotCode);
      entry.count++;
      map.set(c.id, entry);
    }
    return [...map.values()];
  });
}

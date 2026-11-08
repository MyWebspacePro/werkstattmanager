import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const vehicleInputSchema = z.object({
  licensePlate: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  mileage: z.coerce.number().int().min(0).optional(),
});

const customerSchema = z
  .object({
    type: z.enum(["PRIVATE", "COMPANY", "FLEET"]).default("PRIVATE"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    street: z.string().optional(),
    zip: z.string().optional(),
    city: z.string().optional(),
    notes: z.string().optional(),
    emailMarketingConsent: z.boolean().optional(),
    consentSource: z.string().optional(),
    vehicle: vehicleInputSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PRIVATE" && !(data.firstName ?? "").trim() && !(data.lastName ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lastName"], message: "Vor- oder Nachname ist erforderlich" });
    }
    if (data.type !== "PRIVATE" && !(data.company ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["company"], message: "Firma ist erforderlich" });
    }
  });

const listQuery = z.object({
  q: z.string().optional(),
  archived: z.enum(["true", "false"]).default("false"),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

function buildWhere(q?: string, archived = "false") {
  const where: Record<string, unknown> = { archived: archived === "true" };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/customers", async (req) => {
    const { q, archived, skip, take } = listQuery.parse(req.query);
    const where = buildWhere(q, archived);
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { company: "asc" }],
        skip,
        take,
        include: { vehicles: true, consents: true, _count: { select: { workOrders: true } } },
      }),
      prisma.customer.count({ where }),
    ]);
    return { items, total, skip, take };
  });

  app.get("/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        vehicles: { where: { archived: false }, orderBy: { createdAt: "desc" } },
        consents: true,
        workOrders: { orderBy: { openedAt: "desc" }, take: 20 },
        invoices: { orderBy: { date: "desc" }, take: 20 },
        tyreSets: { where: { retrievedAt: null } },
        loans: { orderBy: { outAt: "desc" }, take: 10 },
      },
    });
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    return customer;
  });

  app.post("/customers", async (req) => {
    const { emailMarketingConsent, consentSource, vehicle, ...data } = customerSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: {
        ...data,
        email: data.email || null,
        ...(vehicle ? { vehicles: { create: vehicle } } : {}),
        consents: emailMarketingConsent
          ? {
              create: {
                type: "EMAIL_MARKETING",
                granted: true,
                grantedAt: new Date(),
                source: consentSource ?? "",
              },
            }
          : undefined,
      },
    });
    await audit(req.user!.id, "CREATE", "Customer", customer.id, {
      name: customer.company ?? customer.lastName,
      ...(vehicle ? { plate: vehicle.licensePlate } : {}),
    });
    return customer;
  });

  app.put("/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { emailMarketingConsent, consentSource, vehicle: _vehicle, ...data } = customerSchema.parse(req.body);
    const existing = await prisma.customer.findUnique({ where: { id }, include: { consents: true } });
    if (!existing) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({ where: { id }, data: { ...data, email: data.email || null } });
      if (emailMarketingConsent !== undefined) {
        const current = existing.consents.find((c) => c.type === "EMAIL_MARKETING");
        if (emailMarketingConsent && !current?.granted) {
          await tx.customerConsent.upsert({
            where: { customerId_type: { customerId: id, type: "EMAIL_MARKETING" } },
            update: { granted: true, grantedAt: new Date(), revokedAt: null, source: consentSource ?? current?.source ?? "" },
            create: { customerId: id, type: "EMAIL_MARKETING", granted: true, grantedAt: new Date(), source: consentSource ?? "" },
          });
        } else if (!emailMarketingConsent && current?.granted) {
          await tx.customerConsent.update({
            where: { customerId_type: { customerId: id, type: "EMAIL_MARKETING" } },
            data: { granted: false, revokedAt: new Date() },
          });
        }
      }
      return customer;
    });
    await audit(req.user!.id, "UPDATE", "Customer", id);
    return result;
  });

  // Soft-Delete (10-Jahres-Aufbewahrungslogik: Datensätze bleiben erhalten)
  app.delete("/customers/:id", async (req) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.update({ where: { id }, data: { archived: true } });
    await audit(req.user!.id, "ARCHIVE", "Customer", id);
    return customer;
  });
}

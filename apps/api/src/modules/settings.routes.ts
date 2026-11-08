import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

const settingsSchema = z.object({
  companyName: z.string().min(1),
  addressLine: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  website: z.string().default(""),
  vatNumber: z.string().default(""),
  vatScheme: z.enum(["STANDARD", "SMALL_BUSINESS"]).default("STANDARD"),
  vatRateStandard: z.coerce.number().min(0).max(30).default(8.1),
  vatRateReduced: z.coerce.number().min(0).max(30).default(2.6),
  iban: z.string().default(""),
  qrIban: z.string().default(""),
  bankName: z.string().default(""),
  defaultLaborRate: z.coerce.number().min(0).default(140),
  invoicePrefix: z.string().min(1).default("RE"),
  quotePrefix: z.string().min(1).default("KV"),
  orderPrefix: z.string().min(1).default("AO"),
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(30),
  creditPrefix: z.string().min(1).default("GS"),
  reminderLevel1Days: z.coerce.number().int().min(1).max(180).default(14),
  reminderLevel2Days: z.coerce.number().int().min(1).max(180).default(14),
  reminderLevel3Days: z.coerce.number().int().min(1).max(180).default(14),
  reminderFee1: z.coerce.number().min(0).default(0),
  reminderFee2: z.coerce.number().min(0).default(20),
  reminderFee3: z.coerce.number().min(0).default(30),
  invoiceFooter: z.string().default(""),
});

async function getSettings() {
  return (await prisma.setting.findUnique({ where: { id: 1 } })) ?? prisma.setting.create({ data: { id: 1, companyName: "Neue Werkstatt" } });
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", { preHandler: authGuard }, async () => getSettings());

  app.put(
    "/settings",
    { preHandler: [authGuard, requireRole("ADMIN")] },
    async (req) => {
      const data = settingsSchema.parse(req.body);
      await getSettings(); // stellt Singleton sicher
      const saved = await prisma.setting.update({ where: { id: 1 }, data });
      await audit(req.user!.id, "UPDATE", "Setting", "1", { fields: Object.keys(data) });
      return saved;
    }
  );
}

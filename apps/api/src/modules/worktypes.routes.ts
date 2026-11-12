import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

// Arbeitsarten-Katalog: die Annahme wählt daraus die zu erwartenden Arbeiten;
// Dauer und Qualifikation steuern die Auto-Verplanung (GET /appointments/suggest).

const workTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultMinutes: z.coerce.number().int().min(15).max(24 * 60),
  requiredSkill: z.coerce.number().int().min(0).max(3).default(1),
  laborRate: z.coerce.number().min(0).max(1000).default(140),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function workTypeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // Auch inaktive liefern (für die Verwaltung), sortiert nach Reihenfolge.
  app.get("/worktypes", async () =>
    prisma.workType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  );

  app.post("/worktypes", { preHandler: requireRole("ADMIN") }, async (req) => {
    const data = workTypeSchema.parse(req.body);
    const last = await prisma.workType.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const workType = await prisma.workType.create({ data: { ...data, sortOrder: data.sortOrder ?? (last?.sortOrder ?? 0) + 1 } });
    await audit(req.user!.id, "CREATE", "WorkType", workType.id, { name: workType.name, minutes: workType.defaultMinutes });
    return workType;
  });

  app.put("/worktypes/:id", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = workTypeSchema.partial().parse(req.body);
    const existing = await prisma.workType.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Arbeitsart nicht gefunden" });
    const workType = await prisma.workType.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "WorkType", id, { name: workType.name });
    return workType;
  });

  // Kein Hard-Delete: nur deaktivieren, damit vergangene Verplanungen nachvollziehbar bleiben.
  app.delete("/worktypes/:id", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.workType.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return reply.code(404).send({ error: "Arbeitsart nicht gefunden" });
    const workType = await prisma.workType.update({ where: { id }, data: { active: false } });
    await audit(req.user!.id, "ARCHIVE", "WorkType", id, { name: existing.name });
    return workType;
  });
}

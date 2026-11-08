import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  jobTitle: z.string().optional(),
  password: z.string().min(8, "Mindestens 8 Zeichen"),
  role: z.enum(["ADMIN", "STAFF", "MECHANIC"]),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  jobTitle: z.string().optional(),
  role: z.enum(["ADMIN", "STAFF", "MECHANIC"]).optional(),
  active: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Mindestens 8 Zeichen"),
});

const userSelect = { id: true, email: true, name: true, jobTitle: true, role: true, active: true, createdAt: true } as const;

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users", { preHandler: [authGuard, requireRole("ADMIN")] }, async () => {
    return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
  });

  app.post("/users", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return reply.code(409).send({ error: "E-Mail ist bereits vergeben" });
    const user = await prisma.user.create({
      data: { email, name: body.name, jobTitle: body.jobTitle, role: body.role, passwordHash: await bcrypt.hash(body.password, 10) },
      select: userSelect,
    });
    await audit(req.user!.id, "CREATE", "User", user.id);
    return user;
  });

  app.patch("/users/:id", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!target) return reply.code(404).send({ error: "Benutzer nicht gefunden" });

    // Schutz: sich selbst nicht deaktivieren; letzten aktiven Admin nicht degradieren/deaktivieren
    if (target.id === req.user!.id && body.active === false) {
      return reply.code(400).send({ error: "Du kannst dich nicht selbst deaktivieren" });
    }
    if (target.role === "ADMIN" && target.active && (body.active === false || (body.role !== undefined && body.role !== "ADMIN"))) {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) {
        return reply.code(400).send({ error: "Mindestens ein aktiver Administrator muss bestehen bleiben" });
      }
    }

    const user = await prisma.user.update({ where: { id: target.id }, data: body, select: userSelect });
    await audit(req.user!.id, "UPDATE", "User", user.id);
    return user;
  });

  app.post("/users/:id/password", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const body = resetPasswordSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!target) return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(body.password, 10) },
    });
    await audit(req.user!.id, "PASSWORD_RESET", "User", target.id);
    return { ok: true };
  });
}

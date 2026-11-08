import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import {
  authGuard,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "E-Mail oder Passwort falsch" });
    }
    const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    await audit(user.id, "LOGIN", "User", user.id);
    return {
      accessToken: signAccessToken(tokenUser),
      refreshToken: signRefreshToken(tokenUser),
      user: tokenUser,
    };
  });

  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    if (!refreshToken) return reply.code(400).send({ error: "refreshToken fehlt" });
    let userId: string;
    try {
      userId = verifyRefreshToken(refreshToken).id;
    } catch {
      return reply.code(401).send({ error: "Sitzung abgelaufen, bitte neu einloggen" });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) return reply.code(401).send({ error: "Konto inaktiv" });
    const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    return { accessToken: signAccessToken(tokenUser), user: tokenUser };
  });

  app.get("/me", { preHandler: authGuard }, async (req) => {
    return req.user;
  });
}

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

// Fester bcrypt-Hash (cost 10, wie bei bcrypt.hash(...)) fuer den Vergleich bei
// unbekannten oder inaktiven Konten. Verhindert, dass die Antwortzeit verraet,
// welche E-Mail-Adressen in der Werkstatt existieren (User-Enumeration).
const DUMMY_PASSWORD_HASH = "$2a$10$r2MWaF8cGCRkxo9TIscNnuzXgi0ReIFi2rpb/3icwOfdHXpdIurdS";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Brute-Force-Bremse: 5 Fehlversuche pro Minute und E-Mail, dann 429.
  // Ohne das war jedes Konto per Passwortliste angreifbar.
  // Key = E-Mail statt IP: die ist nicht fälschbar (X-Forwarded-For-Spoofing
  // würde sonst das Limit aushebeln). Kein Treffer -> IP als Fallback.
  const loginRateLimit = {
    max: 5,
    timeWindow: "1 minute",
    keyGenerator: (req: { body?: unknown; ip: string }) => {
      const email = (req.body as { email?: string } | undefined)?.email;
      return (email ?? req.ip).toLowerCase();
    },
  };

  app.post("/login", { config: { rateLimit: loginRateLimit } }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    // Immer vergleichen — auch bei unbekanntem Konto (Dummy-Hash), damit die
    // Antwortzeit nicht zwischen "gibt es" und "gibt es nicht" unterscheidet.
    const passwordOk = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.active || !passwordOk) {
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

  app.put(
    "/password",
    { preHandler: authGuard },
    async (req, reply) => {
      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8, "Neues Passwort: mindestens 8 Zeichen"),
        })
        .parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
        return reply.code(400).send({ error: "Aktuelles Passwort ist falsch" });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
      });
      await audit(user.id, "PASSWORD_CHANGE", "User", user.id);
      return { ok: true };
    },
  );
}

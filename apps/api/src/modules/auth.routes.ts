import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { env } from "../env.js";
import {
  REFRESH_COOKIE,
  authGuard,
  hashToken,
  refreshExpiry,
  signAccessToken,
  signRefreshToken,
  ttlToMs,
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

/**
 * Refresh-Token als httpOnly-Cookie. httpOnly -> fuer JavaScript (und damit bei
 * XSS) nicht lesbar. SameSite=strict -> wird bei fremden Seiten nicht mitgeschickt,
 * das verhindert CSRF. secure automatisch, sobald TLS vor der App endet.
 */
function setRefreshCookie(reply: FastifyReply, token: string, req: FastifyRequest): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: req.protocol === "https",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: Math.floor(ttlToMs(env.REFRESH_TOKEN_TTL) / 1000),
  });
}

function clearRefreshCookie(reply: FastifyReply, req: FastifyRequest): void {
  reply.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: req.protocol === "https",
    sameSite: "strict",
    path: "/api/auth",
  });
}

function meta(req: FastifyRequest): { userAgent: string | null; ip: string } {
  return {
    userAgent: (req.headers["user-agent"] ?? "").slice(0, 255) || null,
    ip: req.ip,
  };
}

/** Neue Session + passenden Refresh-Token erzeugen und in der DB ablegen. */
async function createSession(userId: string, req: FastifyRequest): Promise<{ sid: string; token: string }> {
  const sid = crypto.randomUUID();
  const token = signRefreshToken(sid);
  const { userAgent, ip } = meta(req);
  await prisma.session.create({
    data: { id: sid, userId, tokenHash: hashToken(token), userAgent, ip, expiresAt: refreshExpiry() },
  });
  return { sid, token };
}

/** Alle noch offenen Sessions eines Users sperren (Notfall bei Diebstahl-Verdacht). */
async function revokeAllSessions(userId: string): Promise<number> {
  const r = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

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
    const { sid, token } = await createSession(user.id, req);
    setRefreshCookie(reply, token, req);
    await audit(user.id, "LOGIN", "User", user.id);
    // Refresh-Token nur im Cookie, nie im JSON.
    return { accessToken: signAccessToken(tokenUser, sid), user: tokenUser };
  });

  app.post("/refresh", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return reply.code(400).send({ error: "refreshToken fehlt" });

    let sid: string;
    try {
      sid = verifyRefreshToken(token).sid;
    } catch {
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: "Sitzung abgelaufen, bitte neu einloggen" });
    }

    const session = await prisma.session.findUnique({ where: { id: sid } });
    if (!session) {
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: "Sitzung abgelaufen, bitte neu einloggen" });
    }

    // Hash passt nicht -> Token geaendert oder aus einer anderen Quelle.
    if (session.tokenHash !== hashToken(token)) {
      const n = await revokeAllSessions(session.userId);
      await audit(session.userId, "SESSION_FORGED", "Session", session.id);
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: `Sitzung aus Sicherheitsgruenden beendet (${n})` });
    }

    // Session wurde bereits rotiert, das alte Token wird erneut benutzt:
    // das ist der klassische Diebstahl-Nachweis -> alles sperren.
    if (session.revokedAt) {
      await revokeAllSessions(session.userId);
      await audit(session.userId, "SESSION_REUSE_DETECTED", "Session", session.id);
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: "Sitzung aus Sicherheitsgruenden beendet" });
    }

    if (session.expiresAt < new Date()) {
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: "Sitzung abgelaufen, bitte neu einloggen" });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.active) {
      clearRefreshCookie(reply, req);
      return reply.code(401).send({ error: "Konto inaktiv" });
    }

    const tokenUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const next = await createSession(user.id, req);

    // Rotation: alte Session sperren, neue anlegen — atomar.
    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date(), replacedBy: next.sid },
      }),
    ]);
    setRefreshCookie(reply, next.token, req);
    return { accessToken: signAccessToken(tokenUser, next.sid), user: tokenUser };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) {
      try {
        const { sid } = verifyRefreshToken(token);
        await prisma.session.updateMany({ where: { id: sid }, data: { revokedAt: new Date() } });
      } catch {
        // Ungültiges Token: Cookie trotzdem entfernen.
      }
    }
    clearRefreshCookie(reply, req);
    return { ok: true };
  });

  app.get("/me", { preHandler: authGuard }, async (req) => {
    const { id, email, name, role } = req.user!;
    return { id, email, name, role };
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
      // Alle anderen Sessions beenden — ein geklautes Token wird so wertlos.
      // Die aktuelle bleibt bestehen, damit niemand ausgesperrt wird.
      const currentSid = req.user!.sid;
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null, ...(currentSid ? { NOT: { id: currentSid } } : {}) },
        data: { revokedAt: new Date() },
      });
      await audit(user.id, "PASSWORD_CHANGE", "User", user.id);
      return { ok: true };
    },
  );
}
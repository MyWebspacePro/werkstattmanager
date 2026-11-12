import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../env.js";

export interface TokenUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: TokenUser & { sid?: string };
  }
}

/** Name des httpOnly-Cookies, das den Refresh-Token traegt. */
export const REFRESH_COOKIE = "wm_refresh";

// @types/jsonwebtoken erwartet fuer expiresIn den Template-Literal-Typ von "ms"
// (z.B. "15m" | "30d"). Aus der Env kommt ein generischer string -> Cast.
const ACCESS_TTL = env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"];
const REFRESH_TTL = env.REFRESH_TOKEN_TTL as SignOptions["expiresIn"];

export function signAccessToken(u: TokenUser, sid: string): string {
  return jwt.sign({ ...u, sid }, env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(sid: string): string {
  return jwt.sign({ sid }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyRefreshToken(token: string): { sid: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sid: string };
}

/** Nur der Hash des Tokens wird in der DB gespeichert, nie das Token selbst. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** "30d" | "12h" | "15m" | "45s" -> Millisekunden */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "s" | "m" | "h" | "d"];
  return n * unit;
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + ttlToMs(env.REFRESH_TOKEN_TTL));
}

export async function authGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Nicht eingeloggt" });
    return;
  }
  try {
    // Nur die bekannten Felder uebernehmen -> kein "sid" oder "iat" nach aussen.
    const p = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenUser & { sid?: string };
    req.user = { id: p.id, email: p.email, name: p.name, role: p.role, sid: p.sid };
  } catch {
    reply.code(401).send({ error: "Ungültige oder abgelaufene Sitzung" });
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      reply.code(401).send({ error: "Nicht eingeloggt" });
      return;
    }
    if (roles.length && !roles.includes(req.user.role)) {
      reply.code(403).send({ error: "Keine Berechtigung" });
      return;
    }
  };
}
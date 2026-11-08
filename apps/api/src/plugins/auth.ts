import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
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
    user?: TokenUser;
  }
}

export function signAccessToken(u: TokenUser): string {
  return jwt.sign(u, env.JWT_SECRET, { expiresIn: "12h" });
}

export function signRefreshToken(u: TokenUser): string {
  return jwt.sign({ id: u.id }, env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string };
}

export async function authGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Nicht eingeloggt" });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenUser;
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

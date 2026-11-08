import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authGuard, requireRole } from "../plugins/auth.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req) => {
    const { skip = 0, take = 50, entity } = (req.query ?? {}) as Record<string, string>;
    const where: Record<string, unknown> = {};
    if (entity) where.entity = entity;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(skip),
        take: Math.min(Number(take), 200),
        include: { user: { select: { name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  });
}

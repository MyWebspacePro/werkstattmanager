import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "./env.js";
import { authRoutes } from "./modules/auth.routes.js";
import { settingsRoutes } from "./modules/settings.routes.js";
import { customerRoutes } from "./modules/customers.routes.js";
import { vehicleRoutes } from "./modules/vehicles.routes.js";
import { plannerRoutes } from "./modules/planner.routes.js";
import { quoteRoutes } from "./modules/quotes.routes.js";
import { workOrderRoutes } from "./modules/workorders.routes.js";
import { partsRoutes } from "./modules/parts.routes.js";
import { invoiceRoutes } from "./modules/invoices.routes.js";
import { dashboardRoutes } from "./modules/dashboard.routes.js";
import { auditRoutes } from "./modules/audit.routes.js";
import { tyreRoutes } from "./modules/tyres.routes.js";
import { loanerRoutes } from "./modules/loaners.routes.js";
import { salesRoutes } from "./modules/sales.routes.js";
import { userRoutes } from "./modules/users.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 10 * 1024 * 1024, // 10 MB (CSV-Imports, später Fotos)
    // Nur die Infrastruktur-Hops vertrauen (Traefik = 10.0.1.0/24, Projektnetz
    // = 10.0.4.0/24). public-Clients sind da nie drin, also ist X-Forwarded-For
    // nicht faelschbar. Ohne trustProxy ignoriert Fastify X-Forwarded-Proto und
    // erzeugt http://-URLs, obwohl TLS vor Traefik endet.
    trustProxy: ["10.0.1.0/24", "10.0.4.0/24"],
  });

  // global: false -> greift nur, wo eine Route es per config.rateLimit einschaltet.
  // hook: preHandler, damit der Body schon geparst ist und der Key auf die
  // E-Mail gelegt werden kann (nicht auf die IP, die sich fälschbar ist).
  await app.register(rateLimit, { global: false, hook: "preHandler" });

  // Refresh-Token liegt in einem httpOnly-Cookie -> braucht Cookie-Parsing.
  await app.register(cookie);

  const corsOrigins = env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Kein Origin = curl / Server-zu-Server -> erlauben.
      // Sonst nur die konfigurierte Allowlist; "Origin: null" und Fremd-Domains fallen raus.
      if (!origin) return cb(null, true);
      return cb(null, corsOrigins.includes(origin));
    },
    credentials: true,
  });

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validierung fehlgeschlagen",
        details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (err.validation) {
      return reply.code(400).send({ error: "Ungültige Anfrage", details: err.message });
    }
    // Prisma-Fehler: die Meldung nennt Modell- und Operationsdetails
    // ("No 'Customer' record was found for update.") und darf nicht an den
    // Client gehen. P2025 = passende Zeile fehlt -> 404.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return reply.code(404).send({ error: "Nicht gefunden" });
      }
      req.log.error({ prismaCode: err.code }, err.message);
      return reply.code(409).send({ error: "Datensatz konnte nicht gespeichert werden" });
    }
    req.log.error(err);
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    // Details (Stack, DB-Treiber, interne IDs) nur in die Logs, nie an den Client.
    if (status >= 500) return reply.code(500).send({ error: "Interner Fehler" });
    return reply.code(status).send({ error: err.message || "Fehler" });
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(settingsRoutes, { prefix: "/api" });
  await app.register(customerRoutes, { prefix: "/api" });
  await app.register(vehicleRoutes, { prefix: "/api" });
  await app.register(plannerRoutes, { prefix: "/api" });
  await app.register(quoteRoutes, { prefix: "/api" });
  await app.register(workOrderRoutes, { prefix: "/api" });
  await app.register(partsRoutes, { prefix: "/api" });
  await app.register(invoiceRoutes, { prefix: "/api" });
  await app.register(dashboardRoutes, { prefix: "/api" });
  await app.register(auditRoutes, { prefix: "/api" });
  await app.register(tyreRoutes, { prefix: "/api" });
  await app.register(loanerRoutes, { prefix: "/api" });
  await app.register(salesRoutes, { prefix: "/api" });
  await app.register(userRoutes, { prefix: "/api" });

  return app;
}

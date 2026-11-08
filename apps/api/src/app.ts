import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
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

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 10 * 1024 * 1024, // 10 MB (CSV-Imports, später Fotos)
  });

  await app.register(cors, { origin: true, credentials: true });

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
    req.log.error(err);
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    return reply.code(status).send({ error: err.message || "Interner Fehler" });
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

  return app;
}

import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  const shutdown = async (signal: string) => {
    app.log.info(`Signal ${signal} empfangen, fahre herunter…`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Server-Start fehlgeschlagen:", err);
  process.exit(1);
});

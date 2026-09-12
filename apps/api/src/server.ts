import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApiErrorHandler } from "./api-error-handler.js";
import { config, logDeprecatedConfigWarnings } from "./config.js";
import { closeDb } from "./db.js";
import { migrate } from "./migrate.js";
import { registerRoutes } from "./routes.js";
import { seed } from "./seed.js";
import { startOperatorMetrics } from "./operator-metrics.js";

export const buildServer = async () => {
  if (config.autoMigrate) await migrate();
  if (config.seedOnBoot) await seed();

  const app = Fastify({ logger: true, bodyLimit: Math.ceil(config.templateBuildContextMaxBytes * 1.4) + 4096 });
  registerApiErrorHandler(app);
  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-harakiri-route-token", "last-event-id", "idempotency-key"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  await registerRoutes(app);
  return app;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  logDeprecatedConfigWarnings();
  const app = await buildServer();
  const metrics = await startOperatorMetrics("api").catch(() => { app.log.error("Private metrics listener unavailable; check its configuration and port"); return null; });
  const shutdown = async () => {
    await metrics?.close();
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await app.listen({ host: config.host, port: config.port });
}

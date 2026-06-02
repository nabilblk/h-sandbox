import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, logDeprecatedConfigWarnings } from "./config.js";
import { closeDb } from "./db.js";
import { migrate } from "./migrate.js";
import { registerRoutes } from "./routes.js";
import { seed } from "./seed.js";

export const buildServer = async () => {
  if (config.autoMigrate) await migrate();
  if (config.seedOnBoot) await seed();

  const app = Fastify({ logger: true, bodyLimit: Math.ceil(config.templateBuildContextMaxBytes * 1.4) + 4096 });
  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-harakiri-route-token"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  await registerRoutes(app);
  return app;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  logDeprecatedConfigWarnings();
  const app = await buildServer();
  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await app.listen({ host: config.host, port: config.port });
}

import { readFile } from "node:fs/promises";
import { HarakiriClient } from "@h-sandbox/sdk";
import { Pool } from "pg";
import { buildAdapter } from "./app.js";
import { BindingCipher, PostgresBindings } from "./bindings.js";
import { readConfig } from "./config.js";
import { Sessions } from "./sessions.js";

const config = readConfig();
const pool = new Pool({
  connectionString: config.ADAPTER_DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000
});
// Concurrent file/port probes must be able to wait for the same cold start.
const store = new PostgresBindings(pool, new BindingCipher(Buffer.from(config.ADAPTER_ENCRYPTION_KEY, "hex")),
  config.ADAPTER_READY_TIMEOUT_MS + 45000);
const client = new HarakiriClient({
  apiUrl: config.HARAKIRI_API_URL,
  apiKey: config.HARAKIRI_API_KEY,
  requestTimeoutMs: config.ADAPTER_READY_TIMEOUT_MS
});
const schema: unknown = JSON.parse(await readFile(new URL("../open-terminal.openapi.json", import.meta.url), "utf8"));
const app = await buildAdapter(config, new Sessions(client, store, config), schema);
const shutdown = async () => {
  await app.close();
  await pool.end();
};
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
try {
  await store.migrate();
  await app.listen({ host: "0.0.0.0", port: config.ADAPTER_PORT });
} catch {
  console.error("OpenWebUI adapter startup failed; verify database access and configuration.");
  await shutdown();
  process.exitCode = 1;
}

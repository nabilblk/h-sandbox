import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { privatePostgres } from "./postgres-cluster.mjs";

// No caller DATABASE_URL, shared database or host TCP listener is used.
const root = fileURLToPath(new URL("../../", import.meta.url));
const database = privatePostgres();
try {
  execFileSync("pnpm", ["--filter", "@harakiri/api", "exec", "node", "--test", "--import", "tsx",
    "src/telemetry-control-postgres.test.ts", "src/authorization-postgres.test.ts"], {
    cwd: root, stdio: "inherit", timeout: 120_000,
    env: { ...process.env, SANDBOX_TEST_DATABASE_URL: database.url }
  });
} finally {
  database.close();
}

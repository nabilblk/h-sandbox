import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// New private Unix socket only: never read DATABASE_URL or use a host TCP listener.
process.umask(0o077);
const directory = mkdtempSync("/tmp/harakiri-openwebui-pg-");
const data = join(directory, "data");
const socket = join(directory, "socket");
let started = false;
try {
  mkdirSync(socket, { mode: 0o700 });
  execFileSync("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${socket} -h '' -p 5432 -c max_connections=25`, "-w", "start"], { stdio: "pipe" });
  started = true;
  execFileSync("pnpm", ["exec", "node", "--test", "--import", "tsx", "src/bindings.postgres.test.ts"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit",
    env: { ...process.env, OPENWEBUI_TEST_DATABASE_URL: `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(socket)}` }
  });
  execFileSync("pnpm", ["--filter", "@harakiri/api", "exec", "node", "--test", "--import", "tsx", "src/protected-services-postgres.test.ts"], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)), stdio: "inherit",
    env: { ...process.env, SERVICE_PROXY_TEST_REQUIRED: "1", SERVICE_PROXY_TEST_DATABASE_URL: `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(socket)}` }
  });
} finally {
  if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}

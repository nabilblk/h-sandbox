import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Only a new, private Unix socket. Never use DATABASE_URL, a cluster or a host TCP port.
const directory = mkdtempSync("/tmp/harakiri-framework-pg-");
const data = join(directory, "data");
const socket = join(directory, "socket");
const log = join(directory, "postgres.log");
const root = fileURLToPath(new URL("../", import.meta.url));
let started = false;
try {
  mkdirSync(socket, { mode: 0o700 });
  execFileSync("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p 5432 -c max_connections=25`, "-w", "start"], { stdio: "pipe" });
  started = true;
  execFileSync("pnpm", ["--filter", "@h-sandbox/deepagents", "exec", "node", "--test", "--import", "tsx", "test/durable-postgres.test.ts"], {
    cwd: root, stdio: "inherit", env: { ...process.env,
      HARAKIRI_WORKFLOW_TEST_REQUIRED: "1",
      HARAKIRI_WORKFLOW_TEST_DATABASE_URL: `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(socket)}`
    }
  });
} catch (error) {
  if (!started) {
    try { console.error(readFileSync(log, "utf8")); } catch { /* initdb may have failed before logging. */ }
  }
  throw error;
} finally {
  if (started) execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}

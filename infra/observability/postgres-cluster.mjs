import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** An owned, socket-only cluster; never consumes a caller's DATABASE_URL. */
export function privatePostgres() {
  const directory = mkdtempSync(join(tmpdir(), "harakiri-telemetry-pg-"));
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  const log = join(directory, "postgres.log");
  const options = { stdio: "pipe", timeout: 30_000, env: { ...process.env, LANG: "C", LC_ALL: "C" } };
  let started = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    if (started) {
      execFileSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], options);
    }
    rmSync(directory, { recursive: true, force: true });
    closed = true;
  };
  try {
    mkdirSync(socket, { mode: 0o700 });
    execFileSync("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], options);
    execFileSync("pg_ctl", ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p 5432 -c max_connections=25`, "-w", "start"], options);
    started = true;
    return { directory, url: `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(socket)}`, close };
  } catch (error) {
    // A timed-out start may already have launched a server. Check only our data
    // directory before removing it; never stop a caller's PostgreSQL instance.
    try { execFileSync("pg_ctl", ["-D", data, "status"], { ...options, timeout: 5000 }); started = true; } catch { /* Not running. */ }
    try { close(); } catch (cleanup) { throw new AggregateError([error, cleanup], `Private PostgreSQL cleanup failed; state retained at ${directory}`); }
    throw error;
  }
}

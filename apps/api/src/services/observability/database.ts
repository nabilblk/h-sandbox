import pg from "pg";
import type { Transaction } from "../../db.js";

/** Telemetry must not occupy the connection pool used for runtime operations. */
export function createTelemetryDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString, application_name: "harakiri-observability",
    max: 3, connectionTimeoutMillis: 1000, idleTimeoutMillis: 10_000,
    statement_timeout: 2000, idle_in_transaction_session_timeout: 3000
  });
  // Idle connection errors are surfaced on the next request through the domain
  // error boundary; logging a driver error can reveal connection credentials.
  pool.on("error", () => undefined);
  const transaction: Transaction = async (action) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action((sql, params) => client.query(sql, params));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  };
  return { transaction, close: () => pool.end() };
}

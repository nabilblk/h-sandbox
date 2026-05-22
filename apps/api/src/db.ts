import pg from "pg";
import type { QueryResultRow } from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10
});

export type DbClient = pg.PoolClient | pg.Pool;

export const query = <T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) =>
  pool.query<T>(text, params);

export const withClient = async <T>(fn: (client: pg.PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

export const closeDb = () => pool.end();

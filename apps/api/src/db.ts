import pg from "pg";
import type { QueryResultRow } from "pg";
import { config } from "./config.js";
import type { Query } from "./services/query.js";

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

export type Transaction = <T>(fn: (query: Query) => Promise<T>) => Promise<T>;

export const transaction: Transaction = (fn) => withClient(async (client) => {
  await client.query("BEGIN");
  try {
    const result = await fn((text, params) => client.query(text, params));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
});

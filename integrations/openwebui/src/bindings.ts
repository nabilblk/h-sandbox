import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { z } from "zod";
import { AdapterError } from "./config.js";

// Store only the public route contract, never a provider target or pod identifier.
const grantSchema = z.object({
  url: z.string(),
  routeKey: z.string(),
  accessToken: z.string(),
  accessHeaderName: z.literal("x-harakiri-route-token")
});
export const bindingSchema = z.object({
  version: z.literal(1),
  generation: z.string().uuid(),
  workspaceIntent: z.boolean().default(false),
  workspaceId: z.string().optional(),
  sandboxIntent: z.boolean().default(false),
  creation: z.object({ template: z.string().min(1), ttlSeconds: z.number().int().positive() }).optional(),
  sandboxId: z.string().optional(),
  serviceKey: z.string(),
  grant: grantSchema.optional(),
  routeIntent: z.boolean().default(false),
  createdAt: z.number(),
  renewedAt: z.number().default(0)
});
export type Binding = z.infer<typeof bindingSchema>;
export const newBinding = (workspaceId?: string): Binding => ({
  version: 1,
  generation: randomUUID(),
  workspaceIntent: Boolean(workspaceId),
  ...(workspaceId ? { workspaceId } : {}),
  sandboxIntent: false,
  serviceKey: randomBytes(32).toString("base64url"),
  routeIntent: false,
  createdAt: Date.now(),
  renewedAt: 0
});
export type SaveBinding = (binding: Binding) => Promise<void>;
export interface BindingStore {
  withBinding<T>(
    key: string,
    action: (binding: Binding, save: SaveBinding) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T>;
}

export class BindingCipher {
  readonly #key: Buffer;
  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("Binding encryption requires a 32-byte key");
    this.#key = Buffer.from(key);
  }
  encrypt(identity: string, binding: Binding) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(Buffer.from(identity));
    const body = Buffer.concat([cipher.update(JSON.stringify(bindingSchema.parse(binding))), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]);
  }
  decrypt(identity: string, payload: Buffer): Binding {
    try {
      const cipher = createDecipheriv("aes-256-gcm", this.#key, payload.subarray(0, 12));
      cipher.setAAD(Buffer.from(identity));
      cipher.setAuthTag(payload.subarray(12, 28));
      return bindingSchema.parse(
        JSON.parse(Buffer.concat([cipher.update(payload.subarray(28)), cipher.final()]).toString())
      );
    } catch {
      throw new AdapterError(503, "binding_decryption_failed");
    }
  }
}

export class PostgresBindings implements BindingStore {
  constructor(
    readonly pool: Pool,
    readonly cipher: BindingCipher
  ) {}

  async migrate() {
    const connection = await this.pool.connect();
    let committed = false;
    try {
      await connection.query("BEGIN");
      // Serialize first boot across replicas. Two-part advisory keys are separate
      // from the per-binding bigint locks; no user lifecycle operation is held.
      await connection.query("SELECT pg_advisory_xact_lock(hashtext('harakiri.openwebui.bindings'), 1)");
      await connection.query(`CREATE TABLE IF NOT EXISTS openwebui_bindings (
        identity TEXT PRIMARY KEY, payload BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await connection.query("COMMIT");
      committed = true;
    } finally {
      // Discard a failed transaction's connection; PostgreSQL rolls it back on close.
      connection.release(!committed);
    }
  }

  async inspect(key: string): Promise<Binding | null> {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new AdapterError(400, "invalid_binding");
    const found = await this.pool.query<{ payload: Buffer }>(
      "SELECT payload FROM openwebui_bindings WHERE identity = $1",
      [key]
    );
    return found.rows[0] ? this.cipher.decrypt(key, found.rows[0].payload) : null;
  }

  async withBinding<T>(
    key: string,
    action: (binding: Binding, save: SaveBinding) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new AdapterError(400, "invalid_binding");
    signal?.throwIfAborted();
    const connection = await this.pool.connect();
    let locked = false;
    let broken = false;
    const lock = BigInt.asIntN(64, BigInt(`0x${key.slice(0, 16)}`)).toString();
    try {
      const deadline = Date.now() + 10000;
      while (!locked) {
        signal?.throwIfAborted();
        const result = await connection.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock($1::bigint) AS locked",
          [lock]
        );
        locked = result.rows[0].locked;
        if (!locked) {
          if (Date.now() >= deadline) throw new AdapterError(503, "context_busy");
          await delay(100, undefined, { signal });
        }
      }
      const save: SaveBinding = async (binding) => {
        await connection.query(
          `INSERT INTO openwebui_bindings(identity, payload) VALUES ($1, $2)
          ON CONFLICT(identity) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
          [key, this.cipher.encrypt(key, binding)]
        );
      };
      const found = await connection.query<{ payload: Buffer }>(
        "SELECT payload FROM openwebui_bindings WHERE identity = $1",
        [key]
      );
      const binding = found.rows[0] ? this.cipher.decrypt(key, found.rows[0].payload) : newBinding();
      if (!found.rows[0]) await save(binding);
      signal?.throwIfAborted();
      // Each intent and result commits before the next external side effect; the
      // session lock serializes callers without an open long-running transaction.
      return await action(binding, save);
    } finally {
      if (locked) {
        try {
          await connection.query("SELECT pg_advisory_unlock($1::bigint)", [lock]);
        } catch {
          broken = true;
        }
      }
      connection.release(broken);
    }
  }
}

import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { CommandReference } from "@h-sandbox/deepagents";

/** Supply identity from your authenticated application, never a model or request body. */
export type WorkflowIdentity = Readonly<{ tenantId: string; threadId: string }>;
export type WorkflowRun = {
  id: string;
  sandboxId: string;
  workspaceId: string | null;
  template: string;
  cwd: string;
  phase: "ready" | "invoking" | "approval" | "complete";
};

const columns = `id, sandbox_id AS "sandboxId", workspace_id AS "workspaceId", template, cwd, phase`;

/** Application reference code, not a Harakiri database or a new checkpoint implementation. */
export class WorkflowStore {
  readonly pool: Pool;
  readonly checkpointer: PostgresSaver;
  private readonly locks: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 6, connectionTimeoutMillis: 10_000 });
    this.checkpointer = new PostgresSaver(this.pool);
    // Long-held advisory locks must not exhaust the checkpointer's query pool.
    this.locks = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000 });
  }

  async setup() {
    await this.checkpointer.setup();
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS harakiri_example_runs (
        id uuid PRIMARY KEY,
        tenant_id text NOT NULL,
        thread_id text NOT NULL,
        sandbox_id text NOT NULL,
        workspace_id text,
        template text NOT NULL,
        cwd text NOT NULL,
        phase text NOT NULL CHECK (phase IN ('ready', 'invoking', 'approval', 'complete')),
        UNIQUE (tenant_id, thread_id)
      );
      CREATE TABLE IF NOT EXISTS harakiri_example_commands (
        sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        run_id uuid NOT NULL REFERENCES harakiri_example_runs(id),
        sandbox_id text NOT NULL,
        command_id text NOT NULL,
        UNIQUE (run_id, sandbox_id, command_id)
      );
    `);
  }

  async bind(identity: WorkflowIdentity, input: Omit<WorkflowRun, "id" | "phase">) {
    validateIdentity(identity);
    const result = await this.pool.query<WorkflowRun>(`
      INSERT INTO harakiri_example_runs (id, tenant_id, thread_id, sandbox_id, workspace_id, template, cwd, phase)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
      ON CONFLICT (tenant_id, thread_id) DO NOTHING RETURNING ${columns}`,
    [randomUUID(), identity.tenantId, identity.threadId, input.sandboxId, input.workspaceId, input.template, input.cwd]);
    if (!result.rows[0]) throw new Error("This application thread is already bound. Inspect it; do not overwrite its runtime.");
    return result.rows[0];
  }

  async get(identity: WorkflowIdentity, connection: Pool | PoolClient = this.pool) {
    validateIdentity(identity);
    const { rows } = await connection.query<WorkflowRun>(`
      SELECT ${columns} FROM harakiri_example_runs WHERE tenant_id = $1 AND thread_id = $2`,
    [identity.tenantId, identity.threadId]);
    if (!rows[0]) throw new Error("No workflow belongs to this authenticated tenant and thread.");
    return rows[0];
  }

  async commands(run: WorkflowRun) {
    const { rows } = await this.pool.query<CommandReference>(`
      SELECT sandbox_id AS "sandboxId", command_id AS "commandId"
      FROM harakiri_example_commands WHERE run_id = $1 ORDER BY sequence`, [run.id]);
    return rows;
  }

  async record(run: WorkflowRun, reference: CommandReference) {
    if (reference.sandboxId !== run.sandboxId) throw new Error("Command belongs to another runtime.");
    await this.pool.query(`
      INSERT INTO harakiri_example_commands (run_id, sandbox_id, command_id)
      VALUES ($1, $2, $3) ON CONFLICT (run_id, sandbox_id, command_id) DO NOTHING`,
    [run.id, reference.sandboxId, reference.commandId]);
  }

  async phase(run: WorkflowRun, phase: WorkflowRun["phase"]) {
    await this.pool.query("UPDATE harakiri_example_runs SET phase = $2 WHERE id = $1", [run.id, phase]);
  }

  async exclusive<T>(identity: WorkflowIdentity, action: (run: WorkflowRun) => Promise<T>): Promise<T> {
    const connection = await this.locks.connect();
    let lockId: string | undefined;
    try {
      const run = await this.get(identity, connection);
      const { rows } = await connection.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [`harakiri-example:${run.id}`]);
      if (!rows[0].acquired) throw new Error("Another worker owns this workflow. Do not invoke it concurrently.");
      lockId = run.id;
      // Re-read after acquiring the session lock; do not hold a SQL transaction during inference.
      return await action(await this.get(identity, connection));
    } finally {
      let reusable = !lockId;
      try {
        if (lockId) {
          const { rows } = await connection.query<{ unlocked: boolean }>(
            "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked", [`harakiri-example:${lockId}`]);
          reusable = rows[0]?.unlocked === true;
        }
      } finally { connection.release(!reusable); }
    }
  }

  async close() {
    try { await this.locks.end(); } finally { await this.pool.end(); }
  }
}

function validateIdentity(identity: WorkflowIdentity) {
  for (const value of [identity.tenantId, identity.threadId]) {
    if (!value || value.length > 200 || value.includes("\0")) throw new TypeError("Tenant and thread must be nonempty identifiers of at most 200 characters.");
  }
}

import type { DbClient } from "../db.js";
import { pool } from "../db.js";
import { redactText } from "../redaction.js";
import type { AppendBuildLogInput, BuildLogRecord, BuildLogStore } from "./build-log-store.js";

export class PostgresBuildLogStore implements BuildLogStore {
  readonly kind = "postgres";

  constructor(private readonly client: DbClient = pool) {}

  private async nextLineNo(buildId: string) {
    const result = await this.client.query<{ next: number }>("SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM template_build_logs WHERE build_id = $1", [buildId]);
    return Number(result.rows[0]?.next ?? 1);
  }

  async append(input: AppendBuildLogInput): Promise<BuildLogRecord> {
    const lineNo = await this.nextLineNo(input.buildId);
    const message = redactText(input.message);
    const result = await this.client.query<{ created_at: Date | string }>(
      `INSERT INTO template_build_logs (build_id, line_no, stream, message, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
       ON CONFLICT (build_id, line_no) DO UPDATE
         SET stream = EXCLUDED.stream, message = EXCLUDED.message
       RETURNING created_at`,
      [input.buildId, lineNo, input.stream, message, input.createdAt ?? null]
    );
    return {
      lineNo,
      stream: input.stream,
      message,
      createdAt: new Date(result.rows[0]?.created_at ?? Date.now()).toISOString()
    };
  }

  async list(buildId: string, options: { afterLineNo?: number; limit?: number } = {}): Promise<BuildLogRecord[]> {
    const params: unknown[] = [buildId, options.afterLineNo ?? 0];
    let limitClause = "";
    if (options.limit !== undefined) {
      params.push(options.limit);
      limitClause = ` LIMIT $${params.length}`;
    }
    const result = await this.client.query<{
      lineNo: number;
      stream: "stdout" | "stderr";
      message: string;
      createdAt: Date | string;
    }>(
      `SELECT line_no AS "lineNo", stream, message, created_at AS "createdAt"
       FROM template_build_logs
       WHERE build_id = $1 AND line_no > $2
       ORDER BY line_no ASC${limitClause}`,
      params
    );
    return result.rows.map((line) => ({
      lineNo: Number(line.lineNo),
      stream: line.stream,
      message: redactText(String(line.message)),
      createdAt: new Date(line.createdAt).toISOString()
    }));
  }

  async delete(buildId: string): Promise<number> {
    const result = await this.client.query("DELETE FROM template_build_logs WHERE build_id = $1", [buildId]);
    return result.rowCount ?? 0;
  }
}

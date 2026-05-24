import type { DbClient } from "./db.js";

const nextBuildLogLine = async (client: DbClient, buildId: string) => {
  const result = await client.query<{ next: number }>("SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM template_build_logs WHERE build_id = $1", [buildId]);
  return Number(result.rows[0]?.next ?? 1);
};

export const appendBuildLog = async (client: DbClient, buildId: string, stream: "stdout" | "stderr", message: string) => {
  const lineNo = await nextBuildLogLine(client, buildId);
  await client.query(
    `INSERT INTO template_build_logs (build_id, line_no, stream, message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (build_id, line_no) DO UPDATE
       SET stream = EXCLUDED.stream, message = EXCLUDED.message`,
    [buildId, lineNo, stream, message]
  );
};

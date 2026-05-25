import type { QueryResultRow } from "pg";

export type Query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<{ rows: T[]; rowCount?: number | null }>;

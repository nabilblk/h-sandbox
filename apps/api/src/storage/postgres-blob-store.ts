import { createHash } from "node:crypto";
import type { DbClient } from "../db.js";
import { pool } from "../db.js";
import type { BlobRef, BlobStore, PutBlobInput, StoredBlob } from "./blob-store.js";

const digest = (body: Uint8Array) => `sha256:${createHash("sha256").update(body).digest("hex")}`;

const requireStringMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  if (typeof value !== "string" || !value) throw new Error(`blob metadata.${key} is required`);
  return value;
};

const optionalNumberMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export class PostgresTemplateBuildContextBlobStore implements BlobStore {
  readonly kind = "postgres";

  constructor(private readonly client: DbClient = pool) {}

  async put(input: PutBlobInput): Promise<BlobRef> {
    const sha256 = input.sha256 ?? digest(input.body);
    const organizationId = requireStringMetadata(input.metadata, "organizationId");
    const format = typeof input.metadata?.format === "string" ? input.metadata.format : "tar+gzip";
    const fileCount = optionalNumberMetadata(input.metadata, "fileCount");
    const metadata = input.metadata?.metadata && typeof input.metadata.metadata === "object" && !Array.isArray(input.metadata.metadata)
      ? input.metadata.metadata as Record<string, unknown>
      : {};

    await this.client.query(
      `INSERT INTO template_build_contexts
       (build_id, organization_id, format, sha256, size_bytes, file_count, archive, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (build_id) DO UPDATE
         SET format = EXCLUDED.format,
             sha256 = EXCLUDED.sha256,
             size_bytes = EXCLUDED.size_bytes,
             file_count = EXCLUDED.file_count,
             archive = EXCLUDED.archive,
             metadata = EXCLUDED.metadata,
             updated_at = now()`,
      [
        input.key,
        organizationId,
        format,
        sha256,
        input.body.byteLength,
        fileCount,
        Buffer.from(input.body),
        metadata
      ]
    );

    return {
      store: this.kind,
      key: input.key,
      sha256,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      metadata: input.metadata
    };
  }

  async get(ref: BlobRef): Promise<StoredBlob | null> {
    const result = await this.client.query<{
      build_id: string;
      organization_id: string;
      format: string;
      sha256: string;
      size_bytes: number;
      file_count: number | null;
      archive: Buffer;
      metadata: Record<string, unknown>;
    }>(
      `SELECT build_id, organization_id, format, sha256, size_bytes, file_count, archive, metadata
       FROM template_build_contexts WHERE build_id = $1`,
      [ref.key]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      store: this.kind,
      key: row.build_id,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      contentType: "application/gzip",
      metadata: {
        organizationId: row.organization_id,
        format: row.format,
        fileCount: row.file_count,
        metadata: row.metadata
      },
      body: row.archive
    };
  }

  async delete(ref: BlobRef): Promise<number> {
    const result = await this.client.query("DELETE FROM template_build_contexts WHERE build_id = $1", [ref.key]);
    return result.rowCount ?? 0;
  }

  async exists(ref: BlobRef): Promise<boolean> {
    const result = await this.client.query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM template_build_contexts WHERE build_id = $1) AS exists", [ref.key]);
    return Boolean(result.rows[0]?.exists);
  }
}

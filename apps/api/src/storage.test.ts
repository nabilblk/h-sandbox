import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileSystemBlobStore } from "./storage/filesystem-blob-store.js";
import { FileSystemBuildLogStore } from "./storage/filesystem-build-log-store.js";
import { PostgresBuildLogStore } from "./storage/postgres-build-log-store.js";
import { PostgresTemplateBuildContextBlobStore } from "./storage/postgres-blob-store.js";

test("FileSystemBlobStore stores, reads, checks, and deletes blobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "harakiri-blob-"));
  try {
    const store = new FileSystemBlobStore(root);
    const ref = await store.put({
      key: "contexts/bld_1.tar.gz",
      body: Buffer.from("context"),
      contentType: "application/gzip",
      metadata: { buildId: "bld_1" }
    });

    assert.equal(ref.store, "filesystem");
    assert.equal(ref.sha256, "sha256:ea7792a26f405e2ae9c6f49ca93bbe6076ceac0a1fc53d83426c7d7f2d9377e4");
    assert.equal(await store.exists(ref), true);
    const stored = await store.get(ref);
    assert.equal(Buffer.from(stored?.body ?? []).toString("utf8"), "context");
    assert.deepEqual(stored?.metadata, { buildId: "bld_1" });

    await store.delete(ref);
    assert.equal(await store.exists(ref), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FileSystemBuildLogStore appends redacted ordered log records", async () => {
  const root = await mkdtemp(join(tmpdir(), "harakiri-logs-"));
  try {
    const store = new FileSystemBuildLogStore(root);
    await store.append({ buildId: "bld_1", stream: "stdout", message: "started token=secret-value", createdAt: "2026-05-24T12:00:00.000Z" });
    await store.append({ buildId: "bld_1", stream: "stderr", message: "failed hk_live_abc123", createdAt: "2026-05-24T12:00:01.000Z" });

    const logs = await store.list("bld_1", { afterLineNo: 1 });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].lineNo, 2);
    assert.equal(logs[0].message, "failed [redacted]");

    await store.delete("bld_1");
    assert.deepEqual(await store.list("bld_1"), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PostgresTemplateBuildContextBlobStore writes and reads build contexts through BlobStore", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const archive = Buffer.from("context");
  const client = {
    async query<T>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("SELECT build_id")) {
        return {
          rows: [{
            build_id: "bld_pg",
            organization_id: "11111111-1111-1111-1111-111111111111",
            format: "tar+gzip",
            sha256: "sha256:abc",
            size_bytes: archive.byteLength,
            file_count: 1,
            archive,
            metadata: { from: "test" }
          }] as T[]
        };
      }
      return { rows: [] as T[] };
    }
  };
  const store = new PostgresTemplateBuildContextBlobStore(client as never);

  const ref = await store.put({
    key: "bld_pg",
    body: archive,
    sha256: "sha256:abc",
    metadata: {
      organizationId: "11111111-1111-1111-1111-111111111111",
      format: "tar+gzip",
      fileCount: 1,
      metadata: { from: "test" }
    }
  });
  const stored = await store.get(ref);

  assert.equal(ref.store, "postgres");
  assert.equal(calls[0].params[0], "bld_pg");
  assert.equal(calls[0].params[1], "11111111-1111-1111-1111-111111111111");
  assert.equal(Buffer.from(stored?.body ?? []).toString("utf8"), "context");
  assert.equal(stored?.metadata?.organizationId, "11111111-1111-1111-1111-111111111111");
});

test("PostgresBuildLogStore appends and lists redacted build logs", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const client = {
    async query<T>(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      if (text.includes("COALESCE(MAX(line_no)")) return { rows: [{ next: 3 }] as T[] };
      if (text.includes("RETURNING created_at")) return { rows: [{ created_at: "2026-05-24T12:00:00.000Z" }] as T[] };
      if (text.includes("SELECT line_no")) {
        return {
          rows: [{
            lineNo: 3,
            stream: "stdout",
            message: "ok",
            createdAt: "2026-05-24T12:00:00.000Z"
          }] as T[]
        };
      }
      return { rows: [] as T[] };
    }
  };
  const store = new PostgresBuildLogStore(client as never);

  const record = await store.append({ buildId: "bld_pg", stream: "stdout", message: "token=secret-value" });
  const logs = await store.list("bld_pg", { afterLineNo: 2, limit: 10 });

  assert.equal(record.lineNo, 3);
  assert.equal(record.message, "token=[redacted]");
  assert.deepEqual(logs, [{ lineNo: 3, stream: "stdout", message: "ok", createdAt: "2026-05-24T12:00:00.000Z" }]);
  assert.equal(calls[1].params[3], "token=[redacted]");
});

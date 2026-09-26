import assert from "node:assert/strict";
import test from "node:test";
import { HarakiriClient, HarakiriRequestTimeoutError, HarakiriWaitTimeoutError } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend, HarakiriExecutionError, HarakiriTransferError } from "@h-sandbox/deepagents";
import { fixture } from "./fixture.js";

test("adapter bounds submission and retains an unknown outcome without replay", async () => {
  const f = fixture();
  f.state.override = () => new Promise(() => {});
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox, { requestTimeoutMs: 20 }).execute("effect"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.equal(error.stage, "submission");
    assert.equal(error.reference, undefined);
    assert.ok(error.cause instanceof HarakiriRequestTimeoutError);
    return true;
  });
  assert.equal(f.requests.length, 1);
  assert.ok(f.requests[0].signal?.aborted);
});

test("the observation budget includes final logs and retains the acknowledged reference", async () => {
  const f = fixture();
  f.state.override = r => r.url.pathname.endsWith("/logs") ? new Promise(() => {}) : undefined;
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox, { observationTimeoutMs: 30 }).execute("effect"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.equal(error.stage, "observation");
    assert.deepEqual(error.reference, { sandboxId: f.summary.id, commandId: "cmd_1" });
    assert.ok(error.cause instanceof HarakiriWaitTimeoutError);
    assert.equal(error.cause.id, "cmd_1");
    return true;
  });
  assert.equal(f.commands.size, 1);
  assert.ok(f.requests.every(r => r.method !== "DELETE"));
});

test("final logs honor the client's shorter request deadline when the adapter has no override", async () => {
  const f = fixture();
  f.state.override = r => r.url.pathname.endsWith("/logs") ? new Promise(() => {}) : undefined;
  const client = new HarakiriClient({ apiUrl: "https://harakiri.example.invalid", apiKey: "synthetic-framework-key", fetch: f.fetch, requestTimeoutMs: 20 });
  await assert.rejects(new HarakiriSandboxBackend(client.sandboxes.wrap(f.summary), { observationTimeoutMs: 2000 }).execute("effect"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.ok(error.cause instanceof HarakiriRequestTimeoutError);
    assert.equal(error.cause.requestTimeoutMs, 20);
    assert.deepEqual(error.reference, { sandboxId: f.summary.id, commandId: "cmd_1" });
    return true;
  });
});

test("in-flight transfer cancellation retains earlier verified paths and the exact cause", async () => {
  for (const operation of ["upload", "download"] as const) {
    const f = fixture();
    const controller = new AbortController();
    const reason = new Error("application stopped waiting");
    f.files.set("/app/a", new Uint8Array([1]));
    f.files.set("/app/b", new Uint8Array([2]));
    f.state.override = r => {
      if (r.body.path === "/app/b" || r.url.searchParams.get("path") === "/app/b") {
        queueMicrotask(() => controller.abort(reason));
        return new Promise(() => {});
      }
      return undefined;
    };
    const backend = new HarakiriSandboxBackend(f.sandbox, { signal: controller.signal });
    await assert.rejects(operation === "upload"
      ? backend.uploadFiles([["a", new Uint8Array([1])], ["b", new Uint8Array([2])]])
      : backend.downloadFiles(["a", "b"]), error => {
      assert.ok(error instanceof HarakiriTransferError);
      assert.deepEqual(error.completedPaths, ["a"]);
      assert.equal(error.path, "b");
      assert.equal(error.cause, reason);
      return true;
    });
    assert.ok(f.requests.at(-1)?.signal?.aborted);
  }
});

test("per-request deadline also applies to status polling and file metadata", async () => {
  for (const operation of ["status", "file"] as const) {
    const f = fixture();
    f.state.override = r => r.method === "GET" ? new Promise(() => {}) : undefined;
    const backend = new HarakiriSandboxBackend(f.sandbox, { requestTimeoutMs: 20, observationTimeoutMs: 2000 });
    await assert.rejects(operation === "status" ? backend.execute("effect") : backend.downloadFiles(["a"]), error => {
      assert.ok(error instanceof HarakiriExecutionError || error instanceof HarakiriTransferError);
      assert.ok(error.cause instanceof HarakiriRequestTimeoutError);
      assert.equal(error.cause.requestTimeoutMs, 20);
      return true;
    });
  }
});

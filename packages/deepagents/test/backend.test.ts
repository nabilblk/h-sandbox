import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";
import { HarakiriApiError } from "@h-sandbox/sdk";
import { BaseSandbox, isSandboxBackend, type SandboxBackendProtocolV2 } from "deepagents";
import { HarakiriSandboxBackend, HarakiriExecutionError, HarakiriTransferError, type CommandReference } from "../src/index.js";
import { fixture, apiError } from "./fixture.js";

test("implements the real V2 sandbox contract without exposing a client or owning resources", () => {
  const f = fixture();
  const backend: SandboxBackendProtocolV2 = new HarakiriSandboxBackend(f.sandbox);
  assert.ok(backend instanceof BaseSandbox);
  assert.ok(isSandboxBackend(backend));
  assert.equal(f.requests.length, 0);
  assert.deepEqual((backend as HarakiriSandboxBackend).reference, { sandboxId: f.summary.id });
  for (const serialized of [JSON.stringify(backend), inspect(backend, { depth: null, showHidden: true })]) {
    assert.ok(!serialized.includes("synthetic-framework-key"));
    assert.ok(!serialized.includes("harakiri.example.invalid"));
  }
});

test("submits once, saves the reference before observation and reads logs instead of summary output", async () => {
  const f = fixture();
  let reference: CommandReference | undefined;
  const backend = new HarakiriSandboxBackend(f.sandbox, {
    cwd: "/work", timeoutMs: 5_000,
    onCommandStarted: (value) => { reference = value; assert.equal(f.requests.length, 1); }
  });
  f.state.output = { stdout: "failed assertion", stderr: "details", exitCode: 7, stdoutTruncated: false, stderrTruncated: false };
  const result = await backend.execute("node tests.mjs");
  assert.equal(result.output, "failed assertion\ndetails");
  assert.equal(result.exitCode, 7);
  assert.equal(result.truncated, false);
  assert.deepEqual(reference, result.reference);
  assert.deepEqual(f.requests[0].body, { command: "node tests.mjs", cwd: "/work", timeoutMs: 5_000, detached: true });
  assert.equal(f.requests.filter(r => r.method === "POST").length, 1);
  assert.equal(f.requests.filter(r => r.method === "DELETE").length, 0);
});

test("reconnect and observe never submit, and reject another sandbox's reference", async () => {
  const f = fixture();
  const first = new HarakiriSandboxBackend(f.sandbox);
  const result = await first.execute("one job");
  const reconnected = new HarakiriSandboxBackend(await f.client.sandboxes.connect(f.summary.id));
  const before = f.requests.length;
  assert.equal((await reconnected.observe(result.reference)).output, result.output);
  assert.ok(f.requests.slice(before).every(r => r.method === "GET"));
  await assert.rejects(reconnected.observe({ sandboxId: "sbx_other", commandId: "cmd_1" }), TypeError);
  await assert.rejects(reconnected.observe({ sandboxId: f.summary.id, commandId: "../other" }), TypeError);
});

test("observation and checkpoint errors retain acknowledged IDs without replay", async () => {
  for (const stage of ["observation", "checkpoint"] as const) {
    const f = fixture();
    const cause = new Error("synthetic private diagnostic");
    const backend = new HarakiriSandboxBackend(f.sandbox, {
      onCommandStarted: () => { if (stage === "checkpoint") throw cause; }
    });
    f.state.override = r => { if (r.url.pathname.endsWith("/logs")) throw cause; return undefined; };
    await assert.rejects(backend.execute("work"), error => {
      assert.ok(error instanceof HarakiriExecutionError);
      assert.equal(error.stage, stage);
      assert.deepEqual(error.reference, { sandboxId: f.summary.id, commandId: "cmd_1" });
      assert.equal(error.cause, cause);
      assert.ok(!error.message.includes(cause.message));
      return true;
    });
    assert.equal(f.commands.size, 1);
  }
});

test("lost submission responses are ambiguous, never retried or mapped to shell success", async () => {
  const f = fixture();
  f.state.override = r => r.method === "POST" ? apiError("runtime_command_unavailable", 503) : undefined;
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox).execute("work"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.equal(error.stage, "submission");
    assert.equal(error.reference, undefined);
    assert.ok(error.cause instanceof HarakiriApiError);
    return true;
  });
  assert.equal(f.requests.length, 1);
});

test("cancel before submission sends nothing; cancel after acknowledgement leaves work intact", async () => {
  const f = fixture();
  const controller = new AbortController();
  const reason = new Error("caller canceled");
  const backend = new HarakiriSandboxBackend(f.sandbox, {
    signal: controller.signal, onCommandStarted: () => controller.abort(reason)
  });
  await assert.rejects(backend.execute("work"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.equal(error.cause, reason);
    assert.equal(error.reference?.commandId, "cmd_1");
    return true;
  });
  const before = f.requests.length;
  await assert.rejects(backend.execute("again"), reason);
  assert.equal(f.requests.length, before);
  assert.ok(f.requests.every(r => r.method !== "DELETE"));
});

test("observation deadlines retain the command without automatic termination", async () => {
  const f = fixture();
  const backend = new HarakiriSandboxBackend(f.sandbox, { observationTimeoutMs: 10 });
  f.state.override = r => {
    if (r.method === "GET" && /\/commands\/cmd_1$/.test(r.url.pathname)) {
      return Response.json({ command: { ...f.commands.get("cmd_1"), status: "running" } });
    }
  };
  await assert.rejects(backend.execute("long job"), HarakiriExecutionError);
  assert.equal(f.commands.size, 1);
  assert.ok(f.requests.every(r => r.method !== "DELETE"));
});

test("output is UTF-8 bounded and never discards provider truncation flags", async () => {
  const f = fixture();
  Object.assign(f.state.output, { stdout: "a\u20acb", stderr: "z" });
  for (const [maxOutputBytes, expected] of [[3, "a"], [4, "a\u20ac"]] as const) {
    const result = await new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes }).execute("output");
    assert.equal(result.output, expected);
    assert.equal(result.truncated, true);
  }
  f.state.output.stdoutTruncated = true;
  const flagged = await new HarakiriSandboxBackend(f.sandbox).execute("output");
  assert.equal(flagged.output, "a\u20acb\nz");
  assert.equal(flagged.truncated, true);
  Object.assign(f.state.output, { stdout: "", stderr: "", stdoutTruncated: false });
  const empty = await new HarakiriSandboxBackend(f.sandbox).execute("output");
  assert.equal(empty.output, "");
  assert.equal(empty.truncated, false);
});

test("binary transfers are verified, relative paths match cwd, and partial path failures retain order", async () => {
  const f = fixture();
  const backend = new HarakiriSandboxBackend(f.sandbox, { cwd: "/work" });
  const bytes = new Uint8Array([0, 128, 255, 10]);
  const result = await backend.uploadFiles([["data.bin", bytes], ["\0", bytes], ["empty", new Uint8Array()]]);
  assert.deepEqual(result, [{ path: "data.bin", error: null }, { path: "\0", error: "invalid_path" }, { path: "empty", error: null }]);
  assert.ok(f.files.has("/work/data.bin"));
  const downloaded = await backend.downloadFiles(["missing", "data.bin", "empty"]);
  assert.equal(downloaded[0].error, "file_not_found");
  assert.deepEqual(downloaded[1].content, bytes);
  assert.equal(downloaded[2].content?.length, 0);
});

test("filesystem permission codes map narrowly; organization denial and missing sandbox do not", async () => {
  for (const code of ["file_permission_denied", "forbidden", "sandbox_not_found"]) {
    const f = fixture();
    f.state.override = () => apiError(code, code === "sandbox_not_found" ? 404 : 403);
    const backend = new HarakiriSandboxBackend(f.sandbox);
    if (code === "file_permission_denied") {
      assert.equal((await backend.downloadFiles(["private"]))[0].error, "permission_denied");
    } else {
      await assert.rejects(backend.downloadFiles(["private"]), HarakiriTransferError);
    }
  }
});

test("directories and batch budgets are checked before downloading file bodies", async () => {
  const f = fixture();
  f.files.set("/app/large", new Uint8Array(10));
  f.state.override = r => r.url.searchParams.get("path") === "/app/dir"
    ? Response.json({ file: { type: "directory", size: 0 } }) : undefined;
  const backend = new HarakiriSandboxBackend(f.sandbox, { maxBatchBytes: 4 });
  assert.equal((await backend.downloadFiles(["dir"]))[0].error, "is_directory");
  await assert.rejects(backend.downloadFiles(["large"]), HarakiriTransferError);
  assert.ok(f.requests.every(r => !r.url.pathname.endsWith("/download")));
  const before = f.requests.length;
  await assert.rejects(backend.uploadFiles([["a", new Uint8Array(3)], ["b", new Uint8Array(3)]]), RangeError);
  await assert.rejects(backend.downloadFiles(Array(65).fill("large")), RangeError);
  assert.equal(f.requests.length, before);
});

test("unrepresentable transfer failures preserve successful paths without retrying", async () => {
  const f = fixture();
  f.state.override = r => r.body.path === "/app/b" ? apiError("runtime_files_unavailable", 503) : undefined;
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox).uploadFiles([
    ["a", new Uint8Array([1])], ["b", new Uint8Array([2])], ["c", new Uint8Array([3])]
  ]), error => {
    assert.ok(error instanceof HarakiriTransferError);
    assert.deepEqual(error.completedPaths, ["a"]);
    assert.equal(error.path, "b");
    assert.ok(error.cause instanceof HarakiriApiError);
    return true;
  });
  assert.equal(f.requests.length, 2);
});

test("between-file cancellation preserves completed uploads and downloads and the abort cause", async () => {
  for (const operation of ["upload", "download"] as const) {
    for (const reason of [new Error("caller canceled"), new HarakiriApiError(403, '{"error":"file_permission_denied"}')]) {
      const f = fixture(); const controller = new AbortController();
      const bytes = new Uint8Array([1]);
      f.files.set("/app/a", bytes);
      f.state.override = request => {
        if (request.url.pathname.endsWith(operation === "upload" ? "/upload" : "/download")) controller.abort(reason);
        return undefined;
      };
      const backend = new HarakiriSandboxBackend(f.sandbox, { signal: controller.signal });
      const transfer = operation === "upload"
        ? backend.uploadFiles([["a", bytes], ["b", bytes], ["c", bytes]])
        : backend.downloadFiles(["a", "b", "c"]);
      await assert.rejects(transfer, error => {
        assert.ok(error instanceof HarakiriTransferError);
        assert.equal(error.operation, operation);
        assert.equal(error.path, "b");
        assert.deepEqual(error.completedPaths, ["a"]);
        assert.equal(error.cause, reason);
        return true;
      });
      assert.ok(!f.files.has("/app/b"));
      assert.ok(f.requests.every(r => r.body.path !== "/app/b" && r.url.searchParams.get("path") !== "/app/b"));
    }
  }
});

test("corrupt downloads fail closed through the SDK checksum validation", async () => {
  const f = fixture(); f.files.set("/app/a", new Uint8Array([1]));
  f.state.override = r => r.url.pathname.endsWith("/download")
    ? Response.json({ sizeBytes: 1, contentBase64: "AQ==", sha256: "sha256:incorrect" }) : undefined;
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox).downloadFiles(["a"]), HarakiriTransferError);
});

test("upstream write, edit and readRaw use native Harakiri transfers", async () => {
  const f = fixture(); const backend = new HarakiriSandboxBackend(f.sandbox);
  assert.equal((await backend.write("/app/a.txt", "one two")).path, "/app/a.txt");
  assert.equal((await backend.edit("/app/a.txt", "two", "three")).occurrences, 1);
  assert.equal((await backend.readRaw("/app/a.txt")).data?.content, "one three");
  assert.equal(f.commands.size, 0);
});

test("upstream read, ls, glob and grep delegate scripts to the selected remote sandbox", async () => {
  const f = fixture(); const backend = new HarakiriSandboxBackend(f.sandbox);
  f.state.output.stdout = "     1\thello\n__DEEPAGENTS_READ_METADATA__\t1\n";
  assert.match(String((await backend.read("/app/a.txt")).content), /hello/);
  f.state.output.stdout = "6\t1700000000\tf\t/app/a.txt\n";
  assert.equal((await backend.ls("/app")).files?.[0].path, "/app/a.txt");
  assert.equal((await backend.glob("*.txt", "/app")).files?.[0].path, "a.txt");
  f.state.output.stdout = "/app/a.txt:1:hello\n";
  assert.equal((await backend.grep("hello", "/app")).matches?.[0].text, "hello");
  assert.equal(f.commands.size, 4);
});

test("grep preserves byte and provider truncation, discards partial matches and retains count caps", async () => {
  const f = fixture();
  const first = "/app/a.txt:1:hello\n";
  const second = "/app/b.txt:2:hello again\n";
  f.state.output.stdout = first + second;
  const clipped = await new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes: first.length + second.length - 3 }).grep("hello", "/app");
  assert.equal(clipped.truncated, true);
  assert.deepEqual(clipped.matches, [{ path: "/app/a.txt", line: 1, text: "hello" }]);
  f.state.output.stdoutTruncated = true;
  const provider = await new HarakiriSandboxBackend(f.sandbox).grep("hello", "/app");
  assert.equal(provider.truncated, true);
  assert.equal(provider.matches?.length, 2);
  f.state.output.stdoutTruncated = false;
  const capped = await new HarakiriSandboxBackend(f.sandbox).grep("hello", "/app", null, 1);
  assert.equal(capped.truncated, true);
  assert.equal(capped.matches?.length, 1);
  const complete = await new HarakiriSandboxBackend(f.sandbox).grep("hello", "/app");
  assert.ok(!complete.truncated);
  assert.equal(complete.matches?.length, 2);
  const tiny = await new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes: 1 }).grep("hello", "/app");
  assert.equal(tiny.truncated, true);
  assert.deepEqual(tiny.matches, []);
  assert.match(tiny.error!, /truncated/);
});

test("simultaneous grep calls keep truncation metadata isolated", async () => {
  const f = fixture();
  let release!: () => void;
  const secondFinished = new Promise<void>(resolve => { release = resolve; });
  f.state.override = async request => {
    if (!request.url.pathname.endsWith("/logs")) return;
    const first = request.url.pathname.includes("/cmd_1/");
    if (first) await secondFinished;
    else release();
    return Response.json({ ...f.state.output, stdout: "/app/a.txt:1:hello\n", stdoutTruncated: first });
  };
  const backend = new HarakiriSandboxBackend(f.sandbox);
  const [clipped, complete] = await Promise.all([backend.grep("hello", "/app"), backend.grep("hello", "/app")]);
  assert.equal(clipped.truncated, true);
  assert.ok(!complete.truncated);
});

test("invalid configuration fails locally", () => {
  const f = fixture();
  for (const options of [{ timeoutMs: 0 }, { observationTimeoutMs: NaN }, { maxOutputBytes: 2 ** 21 }, { maxBatchBytes: -1 }]) {
    assert.throws(() => new HarakiriSandboxBackend(f.sandbox, options), RangeError);
  }
  assert.throws(() => new HarakiriSandboxBackend(f.sandbox, { cwd: "relative" }), TypeError);
  assert.equal(f.requests.length, 0);
});

test("separate backends cannot route commands or files into each other's sandboxes", async () => {
  const first = fixture("sbx_first"); const second = fixture("sbx_second");
  const a = new HarakiriSandboxBackend(first.sandbox); const b = new HarakiriSandboxBackend(second.sandbox);
  await a.uploadFiles([["private.txt", new Uint8Array([1])]]);
  assert.equal((await b.downloadFiles(["private.txt"]))[0].error, "file_not_found");
  const result = await a.execute("only first");
  const before = second.requests.length;
  await assert.rejects(b.observe(result.reference), TypeError);
  assert.equal(second.requests.length, before);
  assert.equal(second.commands.size, 0);
});

test("killed commands preserve a null exit code and remote finish reason", async () => {
  const f = fixture();
  f.state.override = request => request.method === "GET" && request.url.pathname.endsWith("/commands/cmd_1")
    ? Response.json({ command: { ...f.commands.get("cmd_1"), status: "killed", exitCode: null, finishReason: "timeout" } }) : undefined;
  const result = await new HarakiriSandboxBackend(f.sandbox).execute("too slow");
  assert.equal(result.exitCode, null);
  assert.equal(result.finishReason, "timeout");
  assert.match(result.output, /Command timed out/);
});

test("abnormal termination remains visible with empty or clipped output without inventing an exit code", async () => {
  for (const reason of ["timeout", "killed", "error", "unknown", null] as const) {
    for (const stdout of ["", "a\u20acb"]) {
      const f = fixture(); f.state.output.stdout = stdout;
      f.state.override = request => request.method === "GET" && request.url.pathname.endsWith("/commands/cmd_1")
        ? Response.json({ command: { ...f.commands.get("cmd_1"), status: "killed", exitCode: null, finishReason: reason } }) : undefined;
      const result = await new HarakiriSandboxBackend(f.sandbox, { maxOutputBytes: 2 }).execute("interrupted");
      assert.equal(result.exitCode, null);
      assert.equal(result.finishReason, reason);
      assert.match(result.output, /^\[Command .*\]/);
      assert.ok(Buffer.byteLength(result.output) <= 100 + 2, "Fixed status metadata must remain bounded.");
      assert.equal(result.truncated, Boolean(stdout));
      assert.ok(!result.output.includes("\ufffd"));
    }
  }
});

test("a stalled first status request is inside the polling deadline", async () => {
  const f = fixture();
  f.state.override = request => request.method === "GET" && request.url.pathname.endsWith("/commands/cmd_1")
    ? new Promise<Response>(() => {}) : undefined;
  await assert.rejects(new HarakiriSandboxBackend(f.sandbox, { observationTimeoutMs: 10 }).execute("work"), error => {
    assert.ok(error instanceof HarakiriExecutionError);
    assert.equal(error.reference?.commandId, "cmd_1");
    return true;
  });
});

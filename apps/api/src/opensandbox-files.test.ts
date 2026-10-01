import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { config } from "./config.js";
import { OpenSandboxFileError, writeFileInSandbox } from "./providers/runtime/opensandbox-files.js";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

const sse = (text = "", error = false) => new Response(`data: ${JSON.stringify(error
  ? { type: "error", error: { evalue: "1", traceback: [text] } }
  : { type: "stdout", text })}\n\n`, { headers: { "content-type": "text/event-stream" } });

function transport(options: {
  path?: string;
  size?: number;
  headers?: Record<string, string>;
  command?: (script: string) => Response | undefined;
  upload?: (body: FormData, attempt: number) => Response | Promise<Response>;
} = {}) {
  const commands: string[] = [];
  const uploads: RequestInit[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/endpoints/44772")) return Response.json({
      endpoint: "http://execd.test", headers: { "X-EXECD-ACCESS-TOKEN": "runtime-test-token", ...options.headers }
    });
    assert.equal(new Headers(init?.headers).get("X-EXECD-ACCESS-TOKEN"), "runtime-test-token");
    if (options.headers?.["OpenSandbox-Ingress-To"]) {
      assert.ok(url.startsWith(config.openSandboxGatewayUrl));
      assert.equal(new Headers(init?.headers).get("OpenSandbox-Ingress-To"), options.headers["OpenSandbox-Ingress-To"]);
    } else assert.ok(url.startsWith("http://execd.test/"));
    if (url.endsWith("/command")) {
      const { command } = JSON.parse(String(init?.body));
      assert.ok(Buffer.byteLength(command) < 8192, "File content must never be part of a command argument");
      commands.push(command);
      return options.command?.(command) ?? sse(command.includes("stat -c")
        ? `file\t${options.path ?? "/workspace/blob.bin"}\t${options.size ?? 3}\t644\trunner\trunner\t1779630000` : "");
    }
    assert.ok(url.endsWith("/files/upload"));
    assert.equal(init?.method, "POST");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(init.body instanceof FormData);
    assert.equal(new Headers(init.headers).has("content-type"), false, "fetch must supply the multipart boundary");
    uploads.push(init);
    return options.upload?.(init.body, uploads.length) ?? new Response(null, { status: 200 });
  };
  return { commands, uploads };
}

test("legacy 1 MiB base64 shell argument reproduces the operating-system limit", { skip: process.platform === "win32" }, () => {
  const argument = `: # ${Buffer.alloc(1024 * 1024).toString("base64")}`;
  assert.throws(() => execFileSync("/bin/sh", ["-c", argument], { timeout: 5000, stdio: "ignore" }), { code: "E2BIG" });
});

for (const size of [0, 1024, 1024 * 1024, 16 * 1024 * 1024]) {
  test(`native multipart upload preserves ${size} binary bytes and keeps commands bounded`, async () => {
    const bytes = Buffer.alloc(size);
    for (let index = 0; index < size; index++) bytes[index] = index % 256;
    const captured = transport({ size, headers: { "OpenSandbox-Ingress-To": "owned-runtime" }, upload: async body => {
      const metadata = body.get("metadata");
      const file = body.get("file");
      assert.ok(metadata instanceof Blob && file instanceof Blob);
      const value = JSON.parse(await metadata.text());
      assert.match(value.path, /^\/workspace\/\.harakiri-write-[a-f0-9-]{36}\/content$/);
      assert.deepEqual(Object.keys(value), ["path"]);
      assert.equal(file.type, "application/octet-stream");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
      return new Response(null, { status: 200 });
    } });
    const written = await writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: bytes.toString("base64"), encoding: "base64" });
    assert.equal(written.size, size);
    assert.equal(captured.uploads.length, 1);
    assert.equal(captured.commands.length, 2);
    assert.match(captured.commands[0]!, /mkdir -m 700/);
    assert.match(captured.commands[0]!, /: > "\$staging\/content"/);
    assert.doesNotMatch(captured.commands[0]!, /mkdir -p/);
    assert.match(captured.commands[1]!, /mv -fT -- "\$staging\/content" "\$target"/);
    assert.match(captured.commands[1]!, /trap 'rm -f.*rmdir.*' EXIT/);
    assert.doesNotMatch(captured.commands.join("\n"), /base64|HARAKIRI_FILE_CONTENT/);
  });
}

test("UTF-8, normalized quoted paths, parent creation and mode 0000 remain supported", async () => {
  const content = "hello \u00e9\u4e16\u754c\nHARAKIRI_FILE_CONTENT\n$(exit 1)";
  const captured = transport({ path: "/workspace/a'b.txt", upload: async body => {
    const request = new Request("http://execd.test/files/upload", { method: "POST", body });
    assert.match(request.headers.get("content-type")!, /^multipart\/form-data; boundary=/);
    const decoded = await request.formData();
    assert.equal(await (decoded.get("file") as Blob).text(), content);
    return new Response(null, { status: 200 });
  } });
  const result = await writeFileInSandbox("test-runtime", { path: "workspace/tmp/../a'b.txt", content, encoding: "utf8", createParents: true, mode: "0000" });
  assert.equal(result.path, "/workspace/a'b.txt");
  assert.ok(captured.commands[0]!.includes("target='/workspace/a'\\''b.txt'"));
  assert.match(captured.commands[0]!, /mkdir -p --/);
  assert.match(captured.commands[1]!, /chmod '0000' -- "\$staging\/content"/);
  assert.ok(captured.commands[1]!.indexOf("chmod ") < captured.commands[1]!.indexOf("mv -fT"));
});

for (const [message, code, statusCode] of [
  ["No such file or directory", "file_not_found", 404],
  ["Permission denied", "file_permission_denied", 403],
  ["Not a directory", "invalid_file_path", 400],
  ["is_a_directory", "invalid_file_path", 400]
] as const) {
  test(`preparation failure is typed (${code}) and never uploads`, async () => {
    const captured = transport({ command: () => sse(message, true) });
    await assert.rejects(writeFileInSandbox("test-runtime", { path: "/missing/file", content: "x", encoding: "utf8" }), { code, statusCode });
    assert.equal(captured.uploads.length, 0);
    assert.equal(captured.commands.length, 1);
  });
}

test("upload failure leaves the target untouched and removes only its owned staging path", async () => {
  const captured = transport({ upload: () => Response.json({ message: "error copying file: permission denied" }, { status: 500 }) });
  await assert.rejects(writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" }), { code: "file_permission_denied", statusCode: 403 });
  assert.equal(captured.uploads.length, 1);
  assert.equal(captured.commands.length, 2);
  assert.doesNotMatch(captured.commands.join("\n"), /mv -fT/);
  assert.match(captured.commands[1]!, /^rm -f -- '\/workspace\/\.harakiri-write-/);
  assert.doesNotMatch(captured.commands[1]!, /rm -rf|blob.bin/);
});

test("ambiguous network failure is not replayed or replaced by a shell upload", async () => {
  const failure = new TypeError("transport lost after upload");
  const captured = transport({ upload: () => { throw failure; } });
  await assert.rejects(writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" }), error => error === failure);
  assert.equal(captured.uploads.length, 1);
  assert.equal(captured.commands.length, 2);
  assert.doesNotMatch(captured.commands.join("\n"), /mv -fT|base64/);
});

test("only explicit gateway not-ready responses retry the same staging upload", async () => {
  const captured = transport({ upload: (_body, attempt) => attempt === 1
    ? new Response("OpenSandbox ingress: sandbox not ready", { status: 503 }) : new Response(null, { status: 200 }) });
  await writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" });
  assert.equal(captured.uploads.length, 2);
  assert.equal(captured.uploads[0]!.body, captured.uploads[1]!.body);
});

test("a missing native endpoint is a provider failure, not a missing user file or legacy fallback", async () => {
  const captured = transport({ upload: () => new Response("404 page not found", { status: 404 }) });
  await assert.rejects(writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" }), { code: "runtime_files_unavailable", statusCode: 502 });
  assert.equal(captured.uploads.length, 1);
  assert.doesNotMatch(captured.commands.join("\n"), /base64|mv -fT/);
});

test("commit failure triggers cleanup and preserves the typed error", async () => {
  const captured = transport({ command: script => script.includes("mv -fT") ? sse("Permission denied", true) : undefined });
  await assert.rejects(writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" }), { code: "file_permission_denied", statusCode: 403 });
  assert.equal(captured.commands.length, 3);
  assert.match(captured.commands[2]!, /^rm -f --/);
});

test("unconfirmed cleanup is disclosed without losing the primary failure", async () => {
  const captured = transport({
    upload: () => Response.json({ message: "Permission denied" }, { status: 500 }),
    command: script => script.startsWith("rm -f --") ? sse("provider unavailable", true) : undefined
  });
  await assert.rejects(writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content: "new", encoding: "utf8" }), error => {
    assert.ok(error instanceof OpenSandboxFileError);
    assert.equal(error.code, "file_permission_denied");
    assert.match(error.message, /cleanup could not be confirmed/);
    assert.ok(error.cause instanceof AggregateError);
    assert.equal(error.cause.errors.length, 2);
    return true;
  });
  assert.equal(captured.uploads.length, 1);
});

test("concurrent uploads use distinct sibling staging directories", async () => {
  const captured = transport();
  await Promise.all(["first", "second"].map(content => writeFileInSandbox("test-runtime", { path: "/workspace/blob.bin", content, encoding: "utf8" })));
  const paths = await Promise.all(captured.uploads.map(async request => JSON.parse(await ((request.body as FormData).get("metadata") as Blob).text()).path));
  assert.equal(new Set(paths).size, 2);
});

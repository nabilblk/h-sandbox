import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeFileInSandbox } from "./providers/runtime/opensandbox-files.js";

// Execute the generated GNU/Linux commands against only a fresh temporary
// directory. No provider, cluster, registry or ambient credentials are accessed.
test("native upload staging preserves real filesystem semantics", { skip: process.platform !== "linux" }, async t => {
  const root = await mkdtemp(join(tmpdir(), "harakiri-file-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let inspectUpload: (() => Promise<void>) | undefined;
  let failUpload = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/endpoints/")) return Response.json({ endpoint: "http://execd.test" });
    if (String(input).endsWith("/command")) {
      const script = JSON.parse(String(init?.body)).command;
      assert.ok(script.includes(root));
      assert.ok(Buffer.byteLength(script) < 8192);
      let event;
      try { event = { type: "stdout", text: execFileSync("/bin/sh", ["-c", script], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }) }; }
      catch (error) { event = { type: "error", error: { evalue: "1", traceback: [String((error as { stderr: unknown }).stderr)] } }; }
      return new Response(`data: ${JSON.stringify(event)}\n\n`);
    }
    assert.ok(String(input).endsWith("/files/upload"));
    const body = init!.body as FormData;
    const { path } = JSON.parse(await (body.get("metadata") as Blob).text());
    assert.ok(path.startsWith(`${root}/`));
    await inspectUpload?.();
    await writeFile(path, Buffer.from(await (body.get("file") as Blob).arrayBuffer()));
    return failUpload ? new Response("simulated transfer failure", { status: 500 }) : new Response(null, { status: 200 });
  };
  const target = join(root, "target.txt");
  const write = (path = target, options = {}) => writeFileInSandbox("hermetic-runtime", { path, content: "replacement", encoding: "utf8", ...options });
  const noStaging = async () => assert.equal((await readdir(root)).some(name => name.startsWith(".harakiri-write-")), false);

  await t.test("failed upload cannot truncate existing target and cleans partial staging", async () => {
    await writeFile(target, "original");
    inspectUpload = async () => { assert.equal(await readFile(target, "utf8"), "original"); };
    failUpload = true;
    await assert.rejects(write(), { code: "runtime_files_unavailable" });
    assert.equal(await readFile(target, "utf8"), "original");
    await noStaging();
    failUpload = false;
  });
  await t.test("successful replacement and explicit mode apply atomically", async () => {
    await write(target, { mode: "0600" });
    assert.equal(await readFile(target, "utf8"), "replacement");
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    await noStaging();
    inspectUpload = undefined;
  });
  await t.test("missing parents are not created unless requested", async () => {
    const path = join(root, "new", "nested", "file");
    await assert.rejects(write(path), { code: "file_not_found" });
    await assert.rejects(stat(join(root, "new")), { code: "ENOENT" });
    await write(path, { createParents: true });
    assert.equal(await readFile(path, "utf8"), "replacement");
    assert.equal((await readdir(join(root, "new", "nested"))).length, 1);
  });
  await t.test("directory destinations are rejected instead of silently moving inside them", async () => {
    const directory = join(root, "directory");
    await mkdir(directory);
    await assert.rejects(write(directory), { code: "invalid_file_path", statusCode: 400 });
    assert.deepEqual(await readdir(directory), []);
    await noStaging();
  });
  await t.test("file symlinks are replaced without modifying their referent", async () => {
    const link = join(root, "link");
    await writeFile(target, "referent");
    await symlink(target, link);
    await write(link);
    assert.equal(await readFile(target, "utf8"), "referent");
    assert.equal(await readFile(link, "utf8"), "replacement");
    await noStaging();
  });
  await t.test("default mode is non-executable and zero mode is honored", async () => {
    const plain = join(root, "plain");
    await write(plain);
    assert.equal((await stat(plain)).mode & 0o777, 0o666 & ~process.umask());
    await write(plain, { mode: "0000" });
    assert.equal((await stat(plain)).mode & 0o777, 0);
    await noStaging();
  });
});

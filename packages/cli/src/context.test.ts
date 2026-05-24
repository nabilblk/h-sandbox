import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createBuildContextArchive } from "./context.js";

const tarEntries = (archive: Buffer) => {
  const tar = gunzipSync(archive);
  const entries: string[] = [];
  let offset = 0;
  while (offset + 512 <= tar.byteLength) {
    const name = tar.toString("utf8", offset, offset + 100).replace(/\0.*$/, "");
    if (!name) break;
    const sizeOctal = tar.toString("utf8", offset + 124, offset + 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeOctal, 8);
    entries.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
};

test("createBuildContextArchive packs regular files and skips heavy defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "harakiri-context-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(dir, "Dockerfile"), "FROM ubuntu:24.04\n");
  await writeFile(join(dir, "src", "agent.py"), "print('ok')\n");
  await writeFile(join(dir, "node_modules", "left-pad", "index.js"), "module.exports = () => '';\n");

  const context = await createBuildContextArchive(dir);

  assert.equal(context.format, "tar+gzip");
  assert.equal(context.fileCount, 2);
  assert.match(context.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(context.archiveBase64, context.archive.toString("base64"));
  assert.deepEqual(tarEntries(context.archive), ["Dockerfile", "src/agent.py"]);
});

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { decodeBuildContextUpload, extractTarGzipBuildContext, sha256Digest } from "./build-context.js";

test("decodeBuildContextUpload verifies size and sha256", () => {
  const archive = Buffer.from("build-context");
  const decoded = decodeBuildContextUpload(
    {
      archiveBase64: archive.toString("base64"),
      sha256: sha256Digest(archive),
      sizeBytes: archive.byteLength,
      fileCount: 2
    },
    1024
  );

  assert.equal(decoded.sha256, sha256Digest(archive));
  assert.equal(decoded.sizeBytes, archive.byteLength);
  assert.equal(decoded.fileCount, 2);
  assert.equal(decoded.format, "tar+gzip");
  assert.deepEqual(decoded.archive, archive);
});

test("decodeBuildContextUpload rejects mismatched archives", () => {
  const archive = Buffer.from("build-context");
  assert.throws(
    () =>
      decodeBuildContextUpload(
        {
          archiveBase64: archive.toString("base64"),
          sha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          sizeBytes: archive.byteLength
        },
        1024
      ),
    /sha256 mismatch/
  );
});

test("decodeBuildContextUpload rejects contexts over the configured limit", () => {
  const archive = Buffer.from("build-context");
  assert.throws(
    () =>
      decodeBuildContextUpload(
        {
          archiveBase64: archive.toString("base64"),
          sha256: sha256Digest(archive),
          sizeBytes: archive.byteLength
        },
        4
      ),
    /exceeds 4 bytes/
  );
});

const simpleTar = (name: string, content: string) => {
  const payload = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(payload.byteLength.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(" ", 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  const pad = Buffer.alloc((512 - (payload.byteLength % 512)) % 512);
  return Buffer.concat([header, payload, pad, Buffer.alloc(1024)]);
};

test("extractTarGzipBuildContext expands regular files safely", async () => {
  const output = await mkdtemp(join(tmpdir(), "harakiri-context-extract-"));
  const archive = gzipSync(simpleTar("src/agent.py", "print('ok')\n"));
  const result = await extractTarGzipBuildContext(archive, output);

  assert.equal(result.files, 1);
  assert.equal(await readFile(join(output, "src", "agent.py"), "utf8"), "print('ok')\n");
});

test("extractTarGzipBuildContext rejects path traversal", async () => {
  const output = await mkdtemp(join(tmpdir(), "harakiri-context-extract-"));
  const archive = gzipSync(simpleTar("../secret", "nope"));
  await assert.rejects(() => extractTarGzipBuildContext(archive, output), /unsafe build context path/);
});

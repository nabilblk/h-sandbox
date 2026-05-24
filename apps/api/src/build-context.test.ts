import assert from "node:assert/strict";
import test from "node:test";
import { decodeBuildContextUpload, sha256Digest } from "./build-context.js";

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

import { check, origins, sha256 } from "../acceptance/context.mjs";
import { run } from "../acceptance/workload.mjs";

export function artifact(size, path = "/workspace/provider-file.bin") {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < size; index++) bytes[index] = index % 256;
  return { path, contentBase64: bytes.toString("base64"), sizeBytes: size, sha256: `sha256:${sha256(bytes)}` };
}

export function fileApi(key, sandboxId) {
  check(/^sbx_[a-zA-Z0-9_-]+$/.test(sandboxId), "Invalid owned sandbox identity");
  return async (route, method = "GET", body) => {
    check(route === "" || route.startsWith("/") || route.startsWith("?"), "Invalid file fixture route");
    const response = await fetch(`${origins.api}/v1/sandboxes/${sandboxId}/files${route}`, {
      method, headers: { "x-api-key": key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180000), redirect: "error"
    });
    return { status: response.status, body: await response.json() };
  };
}

export async function reproduceBaseline(request) {
  const failure = await request("/upload", "POST", artifact(1024 * 1024));
  check(failure.status === 502 && failure.body.error === "runtime_files_unavailable", "Published baseline did not reproduce the upload defect");
  const missing = await request(`/stat?${new URLSearchParams({ path: "/workspace/provider-file.bin" })}`);
  check(missing.status === 404, "Failed baseline upload unexpectedly wrote the target");
  return { status: failure.status, code: "runtime_files_unavailable", bytes: 1024 * 1024,
    argumentLimitReported: /argument list too long|E2BIG/i.test(failure.body.message ?? ""), targetUnchanged: true };
}

export async function verifyTransfers(request, client, id) {
  const results = [];
  for (const size of [0, 1024, 1024 * 1024, 16 * 1024 * 1024]) {
    const body = artifact(size);
    const written = await request("/upload", "POST", { ...body, mode: "0600" });
    check(written.status === 200, `Native upload ${size} bytes: HTTP ${written.status}`);
    check(written.body.sizeBytes === size && written.body.file.size === size && written.body.sha256 === body.sha256, "Upload metadata mismatch");
    const download = await request(`/download?${new URLSearchParams({ path: body.path })}`);
    check(download.status === 200, `Native download ${size} bytes: HTTP ${download.status}`);
    check(download.body.contentBase64 === body.contentBase64 && download.body.sizeBytes === size && download.body.sha256 === body.sha256, "Binary round trip mismatch");
    check(download.body.transfer.maxBytes === 16 * 1024 * 1024, "Advertised transfer boundary changed");
    const independent = await run(client, id, `sha256sum ${body.path}`);
    check(independent.trim().split(/\s/)[0] === body.sha256.slice(7), "Independent runtime checksum mismatch");
    results.push({ sizeBytes: size, sha256: body.sha256, independentChecksum: true });
  }
  const oversized = await request("/upload", "POST", artifact(16 * 1024 * 1024 + 1));
  check(oversized.status === 413 && oversized.body.error === "sandbox_file_artifact_too_large", "Artifact limit no longer enforced");
  const preserved = await request(`/stat?${new URLSearchParams({ path: "/workspace/provider-file.bin" })}`);
  check(preserved.body.file.size === 16 * 1024 * 1024, "Rejected upload changed the destination");
  await run(client, id, "truncate -s 16777217 /workspace/oversized.bin");
  const oversizedDownload = await request(`/download?${new URLSearchParams({ path: "/workspace/oversized.bin" })}`);
  check(oversizedDownload.status === 413 && oversizedDownload.body.error === "sandbox_file_artifact_too_large", "Oversized download was not bounded");
  const missing = await request("/upload", "POST", artifact(1, "/workspace/missing-parent/file"));
  check(missing.status === 404 && missing.body.error === "file_not_found", "Missing parents were silently created");
  const created = await request("/upload", "POST", { ...artifact(1, "/workspace/missing-parent/file"), createParents: true });
  check(created.status === 200, "Explicit parent creation failed");
  const directory = await request("/upload", "POST", artifact(1, "/workspace/missing-parent"));
  check(directory.status === 400 && directory.body.error === "invalid_file_path", "Directory target was not rejected");
  await run(client, id, "mkfifo /workspace/not-a-file");
  for (const path of ["/workspace/not-a-file", "/workspace/missing-parent"]) {
    const nonFile = await request(`/download?${new URLSearchParams({ path })}`);
    check(nonFile.status === 404 && nonFile.body.error === "file_not_found", "Non-regular file was opened for download");
  }
  const text = "hello \u00e9\u4e16\u754c\n".repeat(16384);
  const written = await request("", "PUT", { path: "/workspace/large-text.txt", content: text, encoding: "utf8", mode: "0640" });
  check(written.status === 200 && written.body.file.mode === "0640", "Text write or mode failed");
  const read = await request(`/read?${new URLSearchParams({ path: "/workspace/large-text.txt", encoding: "utf8" })}`);
  check(read.status === 200 && read.body.content === text, "Large UTF-8 text round trip mismatch");
  const invalid = await request("", "PUT", { path: "/workspace/large-text.txt", content: "AA@=", encoding: "base64" });
  check(invalid.status === 400 && invalid.body.error === "invalid_file_content", "Invalid base64 was silently accepted");
  const unchanged = await request(`/read?${new URLSearchParams({ path: "/workspace/large-text.txt", encoding: "utf8" })}`);
  check(unchanged.status === 200 && unchanged.body.content === text, "Invalid file write changed the destination");
  const literal = artifact(1024, "/workspace/$HOME/price$USD.bin");
  const literalUpload = await request("/upload", "POST", { ...literal, createParents: true });
  check(literalUpload.status === 200 && literalUpload.body.file.size === 1024, "Literal dollar-path upload failed");
  const literalDownload = await request(`/download?${new URLSearchParams({ path: literal.path })}`);
  check(literalDownload.status === 200 && literalDownload.body.contentBase64 === literal.contentBase64, "Literal dollar-path download failed");
  const literalHash = await run(client, id, "sha256sum '/workspace/$HOME/price$USD.bin'");
  check(literalHash.trim().split(/\s/)[0] === literal.sha256.slice(7), "Provider expanded a literal path");
  const aliases = await run(client, id, "find /tmp -maxdepth 1 -name '.harakiri-path-*' -print");
  check(aliases.trim() === "", "Literal-path alias cleanup failed");
  const leftovers = await run(client, id, "find /workspace -maxdepth 3 -name '.harakiri-write-*' -print");
  check(leftovers.trim() === "", "Native transfer left staging files behind");
  return { roundTrips: results, maximumEnforced: true, downloadBounded: true, rejectedWritePreservesTarget: true, explicitParentCreation: true, directoryRejected: true, utf8: true, permissions: true, literalPaths: true, stagingCleaned: true };
}

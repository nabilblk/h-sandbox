import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import { builderRuntimeMetadata, scanTemplateImage } from "./template-builder.js";

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
};

const startScanner = async (handler: (body: any) => { status?: number; body?: unknown }) => {
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push(body);
    const result = handler(body);
    response.statusCode = result.status ?? 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(result.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/scan`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
};

const scanInput = {
  buildId: "bld_scan",
  templateId: "open-agents-dev",
  organizationId: "org_scan",
  sourceType: "dockerfile",
  imageUri: "127.0.0.1:5000/harakiri/templates/open-agents-dev@sha256:abc",
  imageDigest: "sha256:abc",
  provenance: { builder: "kaniko" }
};

test("builderRuntimeMetadata records Kubernetes job, pod, and node identity", () => {
  const metadata = builderRuntimeMetadata("hkbld-bld-123", {
    metadata: { name: "hkbld-bld-123-x7mqp", uid: "pod-uid-1" },
    spec: { nodeName: "k0s-worker-1" }
  } as any);

  assert.equal(metadata.builderJobName, "hkbld-bld-123");
  assert.equal(metadata.builderNamespace, "harakiri");
  assert.equal(metadata.builderPodName, "hkbld-bld-123-x7mqp");
  assert.equal(metadata.builderPodUid, "pod-uid-1");
  assert.equal(metadata.builderNodeName, "k0s-worker-1");
});

test("builderRuntimeMetadata keeps nulls when the pod is not observable yet", () => {
  const metadata = builderRuntimeMetadata("hkbld-bld-123", null);

  assert.equal(metadata.builderJobName, "hkbld-bld-123");
  assert.equal(metadata.builderNamespace, "harakiri");
  assert.equal(metadata.builderPodName, null);
  assert.equal(metadata.builderPodUid, null);
  assert.equal(metadata.builderNodeName, null);
});

test("scanTemplateImage returns not_scanned when no scanner webhook is configured", async () => {
  const result = await scanTemplateImage(scanInput, { webhookUrl: "" });

  assert.equal(result.status, "not_scanned");
  assert.deepEqual(result.summary, { status: "not_scanned", reason: "scanner_not_configured" });
});

test("scanTemplateImage posts image provenance and redacts scanner summaries", async () => {
  const scanner = await startScanner((body) => ({
    body: {
      status: "clean",
      imageDigest: body.imageDigest,
      critical: 0,
      registry_password: "super-secret"
    }
  }));
  try {
    const result = await scanTemplateImage(scanInput, { webhookUrl: scanner.url, timeoutMs: 1000 });

    assert.equal(result.status, "clean");
    assert.equal(scanner.requests.length, 1);
    assert.equal(scanner.requests[0].buildId, "bld_scan");
    assert.equal(scanner.requests[0].imageUri, scanInput.imageUri);
    assert.equal(result.summary.registry_password, "[redacted]");
    assert.equal(result.summary.imageDigest, scanInput.imageDigest);
  } finally {
    await scanner.close();
  }
});

test("scanTemplateImage persists scan_failed by default when the scanner fails", async () => {
  const scanner = await startScanner(() => ({ status: 503, body: { error: "scanner unavailable", token: "secret-value" } }));
  try {
    const result = await scanTemplateImage(scanInput, { webhookUrl: scanner.url, timeoutMs: 1000 });

    assert.equal(result.status, "scan_failed");
    assert.equal(result.summary.reason, "scanner_http_error");
    assert.equal(result.summary.statusCode, 503);
    assert.deepEqual(result.summary.body, { error: "scanner unavailable", token: "[redacted]" });
  } finally {
    await scanner.close();
  }
});

test("scanTemplateImage can gate builds when failOnError is enabled", async () => {
  const scanner = await startScanner(() => ({ status: 500, body: { error: "blocked" } }));
  try {
    await assert.rejects(
      scanTemplateImage(scanInput, { webhookUrl: scanner.url, timeoutMs: 1000, failOnError: true }),
      /template scanner failed: template scanner returned HTTP 500/
    );
  } finally {
    await scanner.close();
  }
});

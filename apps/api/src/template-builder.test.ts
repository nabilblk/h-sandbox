import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import { builderRuntimeMetadata, preflightTemplateImagePull, runtimePullPreflightState, scanTemplateImage } from "./template-builder.js";

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

test("runtimePullPreflightState treats post-pull container start errors as a successful pull", () => {
  const state = runtimePullPreflightState({
    status: {
      containerStatuses: [
        {
          name: "pull",
          state: { waiting: { reason: "CreateContainerError", message: "shell not found" } }
        }
      ]
    }
  } as any);

  assert.equal(state.done, true);
  assert.equal(state.ok, true);
  assert.equal(state.reason, "CreateContainerError");
});

test("preflightTemplateImagePull creates and deletes a disposable pull pod", async () => {
  const created: any[] = [];
  const deleted: any[] = [];
  const reads = [
    { status: { phase: "Pending" } },
    {
      spec: { nodeName: "k0s-worker-1" },
      status: {
        containerStatuses: [
          {
            name: "pull",
            imageID: "docker-pullable://127.0.0.1:5000/harakiri/templates/demo@sha256:abc",
            state: { terminated: { reason: "Error", exitCode: 127 } }
          }
        ]
      }
    }
  ];
  const core = {
    async createNamespacedPod(input: any) {
      created.push(input);
    },
    async readNamespacedPodStatus() {
      return reads.shift() as any;
    },
    async deleteNamespacedPod(input: any) {
      deleted.push(input);
    }
  };

  const result = await preflightTemplateImagePull(
    {
      buildId: "bld_preflight",
      templateId: "open-agents-dev",
      imageUri: "127.0.0.1:5000/harakiri/templates/demo@sha256:abc"
    },
    { enabled: true, namespace: "harakiri", timeoutMs: 5000, core, sleepMs: async () => undefined }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.namespace, "harakiri");
  assert.equal(result.podName, "hkpull-bld-preflight");
  assert.equal(result.nodeName, "k0s-worker-1");
  assert.equal(created.length, 1);
  assert.equal(created[0].body.spec.containers[0].image, "127.0.0.1:5000/harakiri/templates/demo@sha256:abc");
  assert.equal(created[0].body.metadata.labels.app, "harakiri-template-pull-preflight");
  assert.equal(deleted.length, 2);
});

test("preflightTemplateImagePull fails on image pull errors", async () => {
  const deleted: any[] = [];
  const core = {
    async createNamespacedPod() {},
    async readNamespacedPodStatus() {
      return {
        status: {
          containerStatuses: [
            {
              name: "pull",
              state: { waiting: { reason: "ImagePullBackOff", message: "pull access denied" } }
            }
          ]
        }
      } as any;
    },
    async deleteNamespacedPod(input: any) {
      deleted.push(input);
    }
  };

  await assert.rejects(
    preflightTemplateImagePull(
      {
        buildId: "bld_denied",
        templateId: "denied-template",
        imageUri: "registry.example.com/private/demo@sha256:abc"
      },
      { enabled: true, namespace: "harakiri", timeoutMs: 5000, core, sleepMs: async () => undefined }
    ),
    /ImagePullBackOff - pull access denied/
  );
  assert.equal(deleted.length, 2);
});

test("preflightTemplateImagePull can be disabled", async () => {
  const result = await preflightTemplateImagePull(
    { buildId: "bld_skip", templateId: "skip", imageUri: "example.com/demo@sha256:abc" },
    { enabled: false }
  );

  assert.deepEqual(result, { status: "skipped", reason: "disabled" });
});

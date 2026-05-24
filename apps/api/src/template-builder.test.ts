import assert from "node:assert/strict";
import test from "node:test";
import { builderRuntimeMetadata } from "./template-builder.js";

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

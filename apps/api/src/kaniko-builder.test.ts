import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJob,
  buildRepository,
  builderRuntimeMetadata,
  registryNamespaceForOrganization,
  safeDockerfilePath
} from "./builders/kaniko-builder.js";

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

test("safeDockerfilePath rejects paths outside the build context", () => {
  assert.equal(safeDockerfilePath("docker/Dockerfile"), "docker/Dockerfile");
  assert.throws(() => safeDockerfilePath("../Dockerfile"), /unsafe Dockerfile path/);
  assert.throws(() => safeDockerfilePath("/Dockerfile"), /unsafe Dockerfile path/);
});

test("buildRepository isolates generated images by organization namespace", () => {
  const repository = buildRepository(
    { organization_id: "20d5e937-4664-4e9e-869c-f12c33e3e46c", template_id: "open-agents-dev" },
    "registry.example.com"
  );

  assert.equal(registryNamespaceForOrganization("20d5e937-4664-4e9e-869c-f12c33e3e46c"), "org-20d5e937-4664-4e9e-869c-f12c33e3e46c");
  assert.equal(repository, "registry.example.com/harakiri/templates/org-20d5e937-4664-4e9e-869c-f12c33e3e46c/open-agents-dev");
});

test("buildJob mounts the push registry credential for the legacy Kubernetes builder", () => {
  const job = buildJob(
    {
      id: "bld_private_push",
      organization_id: "20d5e937-4664-4e9e-869c-f12c33e3e46c",
      template_id: "open-agents-dev"
    },
    "registry.example.com/harakiri/templates/org-20d5e937/open-agents-dev:bld-private-push",
    "Dockerfile",
    {
      id: "11111111-1111-1111-1111-111111111111",
      purpose: "push_pull",
      repositoryPrefix: "harakiri/templates/org-20d5e937",
      secretRef: null,
      pullSecretRef: "private-pull",
      pushSecretRef: "private-push"
    }
  );
  const podSpec = job.spec?.template.spec;
  const builder = podSpec?.containers?.find((container) => container.name === "kaniko");

  assert.deepEqual(
    podSpec?.volumes?.find((volume) => volume.name === "registry-auth")?.secret,
    { secretName: "private-push", items: [{ key: ".dockerconfigjson", path: "config.json" }] }
  );
  assert.deepEqual(
    builder?.volumeMounts?.find((mount) => mount.name === "registry-auth"),
    { name: "registry-auth", mountPath: "/kaniko/.docker", readOnly: true }
  );
});

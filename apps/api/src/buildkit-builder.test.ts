import assert from "node:assert/strict";
import test from "node:test";
import { buildKitBuildArgs, buildKitDigestFromOutput, buildKitJob } from "./builders/buildkit-kubernetes-builder.js";

const digest = `sha256:${"a".repeat(64)}`;

test("buildKitDigestFromOutput reads the pushed image digest", () => {
  assert.equal(buildKitDigestFromOutput(`#8 pushing manifest for registry.example.com/team/app:bld-1@${digest} done`), digest);
  assert.throws(() => buildKitDigestFromOutput("build completed without digest"), /pushed image digest/);
});

test("buildKitBuildArgs creates a rootless buildctl invocation with registry cache", () => {
  const args = buildKitBuildArgs({
    pushRef: "registry.example.com/harakiri/templates/org-demo/app:bld-1",
    dockerfilePath: "docker/Dockerfile",
    cacheRef: "registry.example.com/harakiri/templates/org-demo/cache:buildkit",
    buildArgs: { NODE_ENV: "production" }
  });

  assert.deepEqual(args.slice(0, 9), [
    "build",
    "--frontend",
    "dockerfile.v0",
    "--local",
    "context=/workspace/context",
    "--local",
    "dockerfile=/workspace/context",
    "--opt",
    "filename=docker/Dockerfile"
  ]);
  assert.ok(args.includes("build-arg:NODE_ENV=production"));
  assert.ok(args.some((arg) => arg.startsWith("type=image,name=registry.example.com/harakiri/templates/org-demo/app:bld-1,push=true")));
  assert.ok(args.some((arg) => arg.startsWith("type=registry,ref=registry.example.com/harakiri/templates/org-demo/cache:buildkit,mode=max")));
  assert.equal(args.includes("--metadata-file"), false);
  assert.throws(
    () => buildKitBuildArgs({ pushRef: "image:tag", dockerfilePath: "Dockerfile", cacheRef: "cache:tag", buildArgs: { "bad-name": "x" } }),
    /unsafe Dockerfile build arg name/
  );
});

test("buildKitJob uses rootless BuildKit and mounts push registry credentials", () => {
  const job = buildKitJob(
    {
      id: "bld_buildkit",
      organization_id: "20d5e937-4664-4e9e-869c-f12c33e3e46c",
      template_id: "open-agents-dev"
    },
    "registry.example.com/harakiri/templates/org-20d5e937/open-agents-dev:bld-buildkit",
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
  const builder = podSpec?.containers?.find((container) => container.name === "buildkit");

  assert.equal(job.metadata?.labels?.["harakiri.builder"], "buildkit");
  assert.equal(job.spec?.template.metadata?.annotations?.["container.apparmor.security.beta.kubernetes.io/buildkit"], "unconfined");
  assert.equal(builder?.image, "moby/buildkit:rootless");
  assert.equal(builder?.command?.[0], "buildctl-daemonless.sh");
  assert.deepEqual(builder?.env?.find((item) => item.name === "BUILDKIT_PROGRESS"), { name: "BUILDKIT_PROGRESS", value: "plain" });
  assert.deepEqual(builder?.env?.find((item) => item.name === "DOCKER_CONFIG"), { name: "DOCKER_CONFIG", value: "/registry-auth" });
  assert.deepEqual(
    podSpec?.volumes?.find((volume) => volume.name === "registry-auth")?.secret,
    { secretName: "private-push", items: [{ key: ".dockerconfigjson", path: "config.json" }] }
  );
  assert.deepEqual(
    builder?.volumeMounts?.find((mount) => mount.name === "registry-auth"),
    { name: "registry-auth", mountPath: "/registry-auth", readOnly: true }
  );
  assert.equal(builder?.securityContext?.runAsNonRoot, true);
  assert.equal(builder?.securityContext?.privileged ?? false, false);
});

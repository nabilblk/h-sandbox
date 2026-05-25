import type { V1Job, V1Pod } from "@kubernetes/client-node";
import { appendBuildLog } from "../build-logs.js";
import { config } from "../config.js";
import { withClient } from "../db.js";
import { kubernetes } from "../kubernetes.js";
import { registryCredentialForImage, type RegistryCredentialRef } from "../registry-credentials.js";
import { buildRepository, builderRuntimeMetadata, registryNamespaceForOrganization, safeDockerfilePath } from "./kaniko-builder.js";
import type { ImageBuildRequest, ImageBuildResult, ImageBuilder } from "./image-builder.js";

type DockerfileBuildRef = {
  id: string;
  organization_id: string;
  template_id: string;
};

const safeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "template";

const safeRepositoryPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "") || "template";

const appendImageBuildLog = async (buildId: string, message: string, stream: "stdout" | "stderr" = "stdout") =>
  withClient((client) => appendBuildLog(client, buildId, stream, message));

const buildCacheRef = (build: Pick<DockerfileBuildRef, "organization_id">) =>
  `${config.templateRegistryPushHost}/${safeRepositoryPart(config.templateRegistryRepositoryPrefix)}/${registryNamespaceForOrganization(build.organization_id)}/cache:buildkit`;

const jobNameFor = (buildId: string) => `hkbkit-${safeName(buildId)}`;

const dockerConfigMountPath = "/registry-auth";

const outputSpec = (pushRef: string) =>
  [
    "type=image",
    `name=${pushRef}`,
    "push=true",
    ...(config.templateBuildkitRegistryInsecure ? ["registry.insecure=true"] : [])
  ].join(",");

const cacheSpec = (cacheRef: string, mode?: "import" | "export") =>
  [
    "type=registry",
    `ref=${cacheRef}`,
    ...(mode === "export" ? ["mode=max"] : []),
    ...(config.templateBuildkitRegistryInsecure ? ["registry.insecure=true"] : [])
  ].join(",");

const buildArgOptions = (buildArgs: Record<string, unknown>) =>
  Object.entries(buildArgs).flatMap(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`unsafe Dockerfile build arg name: ${key}`);
    if (value === undefined || value === null) return [];
    return ["--opt", `build-arg:${key}=${String(value)}`];
  });

export const buildKitBuildArgs = (input: {
  pushRef: string;
  dockerfilePath: string;
  cacheRef: string;
  buildArgs?: Record<string, unknown>;
}) => [
  "build",
  "--frontend",
  "dockerfile.v0",
  "--local",
  "context=/workspace/context",
  "--local",
  "dockerfile=/workspace/context",
  "--opt",
  `filename=${input.dockerfilePath}`,
  ...buildArgOptions(input.buildArgs ?? {}),
  "--output",
  outputSpec(input.pushRef),
  "--import-cache",
  cacheSpec(input.cacheRef, "import"),
  "--export-cache",
  cacheSpec(input.cacheRef, "export")
];

export const buildKitJob = (
  build: DockerfileBuildRef,
  pushRef: string,
  dockerfilePath: string,
  pushCredential: RegistryCredentialRef | null,
  buildArgs: Record<string, unknown> = {}
): V1Job => {
  const pushSecretRef = pushCredential?.pushSecretRef ?? pushCredential?.secretRef ?? null;
  const cacheRef = buildCacheRef(build);
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobNameFor(build.id),
      namespace: config.templateBuilderNamespace,
      labels: {
        app: "harakiri-template-build",
        "harakiri.builder": "buildkit",
        "harakiri.build": safeName(build.id),
        "harakiri.template": safeName(build.template_id)
      }
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 600,
      template: {
        metadata: {
          annotations: {
            "container.apparmor.security.beta.kubernetes.io/buildkit": "unconfined"
          },
          labels: {
            app: "harakiri-template-build",
            "harakiri.builder": "buildkit",
            "harakiri.build": safeName(build.id),
            "harakiri.template": safeName(build.template_id)
          }
        },
        spec: {
          restartPolicy: "Never",
          volumes: [
            { name: "workspace", emptyDir: {} },
            ...(pushSecretRef
              ? [{
                  name: "registry-auth",
                  secret: {
                    secretName: pushSecretRef,
                    items: [{ key: ".dockerconfigjson", path: "config.json" }]
                  }
                }]
              : [])
          ],
          initContainers: [
            {
              name: "context-exporter",
              image: config.templateBuilderJobImage,
              imagePullPolicy: "IfNotPresent",
              command: ["node", "apps/api/dist/template-build-context-exporter.js"],
              env: [
                { name: "TEMPLATE_BUILD_ID", value: build.id },
                { name: "TEMPLATE_CONTEXT_DIR", value: "/workspace/context" }
              ],
              envFrom: [{ configMapRef: { name: "harakiri-config" } }, { secretRef: { name: "harakiri-api" } }],
              volumeMounts: [{ name: "workspace", mountPath: "/workspace" }]
            }
          ],
          containers: [
            {
              name: "buildkit",
              image: config.templateBuildkitImage,
              imagePullPolicy: "IfNotPresent",
              command: ["buildctl-daemonless.sh"],
              args: buildKitBuildArgs({ pushRef, dockerfilePath, cacheRef, buildArgs }),
              env: [
                { name: "BUILDKIT_PROGRESS", value: "plain" },
                { name: "BUILDKITD_FLAGS", value: config.templateBuildkitdFlags },
                ...(pushSecretRef ? [{ name: "DOCKER_CONFIG", value: dockerConfigMountPath }] : [])
              ],
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                runAsGroup: 1000,
                seccompProfile: { type: "Unconfined" }
              },
              volumeMounts: [
                { name: "workspace", mountPath: "/workspace" },
                ...(pushSecretRef ? [{ name: "registry-auth", mountPath: dockerConfigMountPath, readOnly: true }] : [])
              ]
            }
          ]
        }
      }
    }
  };
};

const podForJob = async (jobName: string) => {
  const pods = await kubernetes.core().listNamespacedPod({
    namespace: config.templateBuilderNamespace,
    labelSelector: `job-name=${jobName}`
  });
  return pods.items[0] ?? null;
};

const appendJobLogs = async (buildId: string, jobName: string) => {
  const pod = await podForJob(jobName).catch(() => null);
  if (!pod?.metadata?.name) return;
  const containers = new Map([
    ["context-exporter", "context"],
    ["buildkit", "builder"]
  ]);
  for (const [container, label] of containers) {
    const text = await kubernetes
      .core()
      .readNamespacedPodLog({ namespace: config.templateBuilderNamespace, name: pod.metadata.name, container })
      .catch(() => "");
    if (!text) continue;
    await withClient(async (client) => {
      for (const line of text.split(/\r?\n/).filter(Boolean)) await appendBuildLog(client, buildId, "stdout", `[${label}] ${line}`);
    });
  }
};

export const buildKitDigestFromOutput = (raw: string) => {
  const text = raw.trim();
  if (!text) throw new Error("BuildKit did not write build output");
  const matches = [...text.matchAll(/pushing manifest for \S+@(sha256:[a-f0-9]{64})\b/gi)];
  const digest = matches.at(-1)?.[1] ?? "";
  if (!digest) throw new Error("BuildKit output did not include a pushed image digest");
  return digest.toLowerCase();
};

const waitForJobDigest = async (buildId: string, jobName: string) => {
  const started = Date.now();
  while (Date.now() - started < config.templateBuilderJobTimeoutMs) {
    const job = await kubernetes.batch().readNamespacedJobStatus({ namespace: config.templateBuilderNamespace, name: jobName });
    if ((job.status?.succeeded ?? 0) > 0) {
      const pod = await podForJob(jobName);
      const log = pod?.metadata?.name
        ? await kubernetes.core().readNamespacedPodLog({ namespace: config.templateBuilderNamespace, name: pod.metadata.name, container: "buildkit" })
        : "";
      return { digest: buildKitDigestFromOutput(log), pod };
    }
    if ((job.status?.failed ?? 0) > 0) {
      await appendJobLogs(buildId, jobName);
      throw new Error(`template BuildKit job ${jobName} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await appendJobLogs(buildId, jobName);
  throw new Error(`template BuildKit job ${jobName} timed out`);
};

const metadataNumber = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export class BuildKitKubernetesBuilder implements ImageBuilder {
  readonly kind = "buildkit";
  readonly capabilities = {
    dockerfile: true,
    imageImport: false,
    git: false,
    cache: true,
    rootless: true
  };

  async build(request: ImageBuildRequest): Promise<ImageBuildResult> {
    if (request.source.type !== "dockerfile") {
      throw new Error(`BuildKitKubernetesBuilder cannot build source type ${request.source.type}`);
    }

    const startedAt = new Date().toISOString();
    const contextHash = request.source.contextRef;
    if (!contextHash) throw new Error(`build ${request.buildId} has no uploaded context`);

    const build = {
      id: request.buildId,
      organization_id: request.organizationId,
      template_id: request.templateId
    };
    const dockerfilePath = safeDockerfilePath(request.source.dockerfilePath);
    const tag = safeName(request.buildId);
    const pushRepository = buildRepository(build, config.templateRegistryPushHost);
    const runtimeRepository = buildRepository(build, config.templateRegistryRuntimeHost);
    const pushRef = `${pushRepository}:${tag}`;
    const pushCredential = await registryCredentialForImage(request.organizationId, pushRef, "push");
    const pushSecretRef = pushCredential?.pushSecretRef ?? pushCredential?.secretRef ?? null;
    const jobName = jobNameFor(request.buildId);

    await appendImageBuildLog(request.buildId, `creating BuildKit template builder job ${jobName}`);
    await kubernetes.batch().createNamespacedJob({
      namespace: config.templateBuilderNamespace,
      body: buildKitJob(build, pushRef, dockerfilePath, pushCredential, request.source.buildArgs)
    });
    const { digest, pod } = await waitForJobDigest(request.buildId, jobName);
    await appendJobLogs(request.buildId, jobName);

    const imageUri = `${runtimeRepository}@${digest}`;
    const completedAt = new Date().toISOString();
    await appendImageBuildLog(request.buildId, `pushed ${pushRef} as ${imageUri}`);

    return {
      imageUri,
      imageDigest: digest,
      provenance: {
        builder: this.kind,
        startedAt,
        completedAt,
        details: {
          provider: "buildkit",
          source: "dockerfile",
          dockerfilePath,
          contextHash,
          contextSizeBytes: metadataNumber(request.metadata, "contextSizeBytes"),
          contextFileCount: metadataNumber(request.metadata, "contextFileCount"),
          pushedImage: pushRef,
          runtimeImage: imageUri,
          cacheRef: buildCacheRef(build),
          registryNamespace: registryNamespaceForOrganization(request.organizationId),
          registryPushCredentialId: pushCredential?.id ?? null,
          registryPushSecretRef: pushSecretRef,
          rootless: true,
          buildkitImage: config.templateBuildkitImage,
          buildkitdFlags: config.templateBuildkitdFlags,
          registryInsecure: config.templateBuildkitRegistryInsecure,
          ...builderRuntimeMetadata(jobName, pod)
        }
      }
    };
  }
}

export const buildKitKubernetesBuilder = new BuildKitKubernetesBuilder();

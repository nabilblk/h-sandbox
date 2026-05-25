import type { V1Job, V1Pod } from "@kubernetes/client-node";
import path from "node:path";
import { appendBuildLog } from "../build-logs.js";
import { config } from "../config.js";
import { withClient } from "../db.js";
import { kubernetes } from "../kubernetes.js";
import { registryCredentialForImage, type RegistryCredentialRef } from "../registry-credentials.js";
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

export const safeDockerfilePath = (value: string | null | undefined) => {
  const normalized = path.posix.normalize((value ?? "Dockerfile").replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`unsafe Dockerfile path: ${value}`);
  }
  return normalized;
};

const appendImageBuildLog = async (buildId: string, message: string, stream: "stdout" | "stderr" = "stdout") =>
  withClient((client) => appendBuildLog(client, buildId, stream, message));

export const registryNamespaceForOrganization = (organizationId: string) =>
  `org-${safeRepositoryPart(organizationId).slice(0, 80)}`;

export const buildRepository = (build: Pick<DockerfileBuildRef, "organization_id" | "template_id">, host: string) => {
  const prefix = safeRepositoryPart(config.templateRegistryRepositoryPrefix);
  return `${host}/${prefix}/${registryNamespaceForOrganization(build.organization_id)}/${safeRepositoryPart(build.template_id)}`;
};

const buildCacheRepository = (build: Pick<DockerfileBuildRef, "organization_id">) =>
  `${config.templateRegistryPushHost}/${safeRepositoryPart(config.templateRegistryRepositoryPrefix)}/${registryNamespaceForOrganization(build.organization_id)}/cache`;

const jobNameFor = (buildId: string) => `hkbld-${safeName(buildId)}`;

export const buildJob = (build: DockerfileBuildRef, pushRef: string, dockerfilePath: string, pushCredential: RegistryCredentialRef | null): V1Job => {
  const pushSecretRef = pushCredential?.pushSecretRef ?? pushCredential?.secretRef ?? null;
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: jobNameFor(build.id),
      namespace: config.templateBuilderNamespace,
      labels: {
        app: "harakiri-template-build",
        "harakiri.build": safeName(build.id),
        "harakiri.template": safeName(build.template_id)
      }
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 600,
      template: {
        metadata: {
          labels: {
            app: "harakiri-template-build",
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
              name: "kaniko",
              image: config.templateLegacyDockerfileBuilderImage,
              args: [
                "--context=dir:///workspace/context",
                `--dockerfile=/workspace/context/${dockerfilePath}`,
                `--destination=${pushRef}`,
                "--digest-file=/dev/termination-log",
                "--cache=true",
                `--cache-repo=${buildCacheRepository(build)}`,
                "--insecure",
                `--insecure-registry=${config.templateRegistryPushHost}`,
                `--skip-tls-verify-registry=${config.templateRegistryPushHost}`
              ],
              volumeMounts: [
                { name: "workspace", mountPath: "/workspace" },
                ...(pushSecretRef ? [{ name: "registry-auth", mountPath: "/kaniko/.docker", readOnly: true }] : [])
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

export const builderRuntimeMetadata = (jobName: string, pod: V1Pod | null) => ({
  builderJobName: jobName,
  builderNamespace: config.templateBuilderNamespace,
  builderPodName: pod?.metadata?.name ?? null,
  builderPodUid: pod?.metadata?.uid ?? null,
  builderNodeName: pod?.spec?.nodeName ?? null
});

const appendJobLogs = async (buildId: string, jobName: string) => {
  const pod = await podForJob(jobName).catch(() => null);
  if (!pod?.metadata?.name) return;
  const containers = new Map([
    ["context-exporter", "context"],
    ["kaniko", "builder"]
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

const waitForJobDigest = async (buildId: string, jobName: string) => {
  const started = Date.now();
  while (Date.now() - started < config.templateBuilderJobTimeoutMs) {
    const job = await kubernetes.batch().readNamespacedJobStatus({ namespace: config.templateBuilderNamespace, name: jobName });
    if ((job.status?.succeeded ?? 0) > 0) {
      const pod = await podForJob(jobName);
      const message = pod?.status?.containerStatuses?.find((status) => status.name === "kaniko")?.state?.terminated?.message?.trim() ?? "";
      if (!/^sha256:[a-f0-9]{64}$/.test(message)) throw new Error(`legacy image builder did not report an image digest for ${buildId}`);
      return { digest: message, pod };
    }
    if ((job.status?.failed ?? 0) > 0) {
      await appendJobLogs(buildId, jobName);
      throw new Error(`template build job ${jobName} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await appendJobLogs(buildId, jobName);
  throw new Error(`template build job ${jobName} timed out`);
};

const metadataNumber = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export class KanikoLegacyBuilder implements ImageBuilder {
  readonly kind = "kaniko-legacy";
  readonly capabilities = {
    dockerfile: true,
    imageImport: false,
    git: false,
    cache: true,
    rootless: false
  };

  async build(request: ImageBuildRequest): Promise<ImageBuildResult> {
    if (request.source.type !== "dockerfile") {
      throw new Error(`KanikoLegacyBuilder cannot build source type ${request.source.type}`);
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

    await appendImageBuildLog(request.buildId, `creating template builder job ${jobName}`);
    await kubernetes.batch().createNamespacedJob({
      namespace: config.templateBuilderNamespace,
      body: buildJob(build, pushRef, dockerfilePath, pushCredential)
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
          provider: "kaniko",
          source: "dockerfile",
          dockerfilePath,
          contextHash,
          contextSizeBytes: metadataNumber(request.metadata, "contextSizeBytes"),
          contextFileCount: metadataNumber(request.metadata, "contextFileCount"),
          pushedImage: pushRef,
          runtimeImage: imageUri,
          registryNamespace: registryNamespaceForOrganization(request.organizationId),
          registryPushCredentialId: pushCredential?.id ?? null,
          registryPushSecretRef: pushSecretRef,
          ...builderRuntimeMetadata(jobName, pod)
        }
      }
    };
  }
}

export const kanikoLegacyBuilder = new KanikoLegacyBuilder();

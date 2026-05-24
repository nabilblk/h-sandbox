import type { V1Job } from "@kubernetes/client-node";
import path from "node:path";
import { config } from "./config.js";
import { makeId } from "./crypto.js";
import { closeDb, withClient } from "./db.js";
import { kubernetes } from "./kubernetes.js";
import { resolveImageDigest } from "./registry.js";
import { appendBuildLog } from "./build-logs.js";
import { redactRecord, redactText } from "./redaction.js";

type BuildRow = {
  id: string;
  organization_id: string;
  template_id: string;
  source_type: string;
  dockerfile_path: string | null;
  context_hash: string | null;
  image_destination: string | null;
  metadata: Record<string, unknown>;
  template_image: string;
  template_default_entrypoint: string[];
  template_cpu_count: number;
  template_memory_mb: number;
  template_workdir: string;
  template_default_ports: number[];
  context_sha256?: string;
  context_size_bytes?: number;
  context_file_count?: number | null;
};

type ReadyImage = {
  imageUri: string;
  imageDigest: string;
  metadata: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const safeDockerfilePath = (value: string | null) => {
  const normalized = path.posix.normalize((value ?? "Dockerfile").replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`unsafe Dockerfile path: ${value}`);
  }
  return normalized;
};

const claimBuild = async (sourceType: "image" | "dockerfile") =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query<BuildRow>(
        `SELECT b.id, b.organization_id, b.template_id, b.source_type,
                b.dockerfile_path, b.context_hash, b.image_destination, b.metadata,
                t.image AS template_image,
                t.default_entrypoint AS template_default_entrypoint,
                t.cpu_count AS template_cpu_count,
                t.memory_mb AS template_memory_mb,
                t.workdir AS template_workdir,
                t.default_ports AS template_default_ports,
                c.sha256 AS context_sha256,
                c.size_bytes AS context_size_bytes,
                c.file_count AS context_file_count
         FROM template_builds b
         JOIN templates t ON t.id = b.template_id
         LEFT JOIN template_build_contexts c ON c.build_id = b.id
         WHERE b.status = 'queued'
           AND b.source_type = $1
           AND ($1 <> 'dockerfile' OR c.build_id IS NOT NULL)
         ORDER BY b.created_at ASC
         FOR UPDATE OF b SKIP LOCKED
         LIMIT 1`,
        [sourceType]
      );
      const build = result.rows[0] ?? null;
      if (!build) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        `UPDATE template_builds
         SET status = 'building',
             started_at = COALESCE(started_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [build.id]
      );
      await appendBuildLog(client, build.id, "stdout", `${sourceType} builder claimed ${build.id}`);
      await client.query("COMMIT");
      return build;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

const completeBuild = async (build: BuildRow, ready: ReadyImage) =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const version = await client.query<{ next: number }>("SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM template_versions WHERE template_id = $1", [build.template_id]);
      const versionId = makeId("tplv", 12);
      const versionNumber = Number(version.rows[0]?.next ?? 1);
      await client.query(
        `INSERT INTO template_versions
         (id, template_id, organization_id, build_id, version_number, aliases,
          image_uri, image_digest, status, default_entrypoint, cpu_count, memory_mb,
          workdir, default_ports, metadata, promoted_at)
         VALUES ($1, $2, $3, $4, $5, ARRAY['latest'], $6, $7, 'ready', $8, $9, $10, $11, $12, $13, now())`,
        [
          versionId,
          build.template_id,
          build.organization_id,
          build.id,
          versionNumber,
          ready.imageUri,
          ready.imageDigest,
          build.template_default_entrypoint,
          build.template_cpu_count,
          build.template_memory_mb,
          build.template_workdir,
          build.template_default_ports,
          redactRecord({ ...build.metadata, ...ready.metadata })
        ]
      );
      await client.query(
        `UPDATE templates
         SET latest_version_id = $2,
             image = $3,
             image_digest = $4,
             status = 'ready',
             updated_at = now()
         WHERE id = $1`,
        [build.template_id, versionId, ready.imageUri, ready.imageDigest]
      );
      await client.query(
        `UPDATE template_builds
         SET status = 'success',
             image_destination = $2,
             image_digest = $3,
             completed_at = now(),
             updated_at = now(),
             metadata = metadata || $4::jsonb
         WHERE id = $1`,
        [build.id, ready.imageUri, ready.imageDigest, JSON.stringify(redactRecord({ templateVersionId: versionId, readyImage: ready.metadata }))]
      );
      await appendBuildLog(client, build.id, "stdout", `created template version ${versionId}`);
      await client.query("COMMIT");
      return { versionId, digest: ready.imageDigest, imageUri: ready.imageUri };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

const failBuild = async (build: BuildRow, error: unknown) =>
  withClient(async (client) => {
    const message = redactText(error instanceof Error ? error.message : String(error));
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE template_builds
         SET status = 'failed',
             error = $2,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [build.id, message]
      );
      await appendBuildLog(client, build.id, "stderr", message);
      await client.query("COMMIT");
    } catch (rollbackError) {
      await client.query("ROLLBACK");
      throw rollbackError;
    }
  });

const imageImportReadyImage = async (build: BuildRow): Promise<ReadyImage> => {
  const imageRef = build.image_destination ?? build.template_image;
  const resolved = await resolveImageDigest(imageRef);
  return {
    imageUri: resolved.digestPinnedRef,
    imageDigest: resolved.digest,
    metadata: {
      source: "image-import",
      requestedImage: imageRef,
      resolvedImage: resolved.digestPinnedRef
    }
  };
};

const buildRepository = (build: BuildRow, host: string) => {
  const prefix = safeRepositoryPart(config.templateRegistryRepositoryPrefix);
  return `${host}/${prefix}/${safeRepositoryPart(build.template_id)}`;
};

const jobNameFor = (buildId: string) => `hkbld-${safeName(buildId)}`;

const buildJob = (build: BuildRow, pushRef: string, dockerfilePath: string): V1Job => ({
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
        volumes: [{ name: "workspace", emptyDir: {} }],
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
            image: config.templateBuilderKanikoImage,
            args: [
              "--context=dir:///workspace/context",
              `--dockerfile=/workspace/context/${dockerfilePath}`,
              `--destination=${pushRef}`,
              "--digest-file=/dev/termination-log",
              "--cache=true",
              `--cache-repo=${config.templateRegistryPushHost}/${safeRepositoryPart(config.templateRegistryRepositoryPrefix)}/cache`,
              "--insecure",
              `--insecure-registry=${config.templateRegistryPushHost}`,
              `--skip-tls-verify-registry=${config.templateRegistryPushHost}`
            ],
            volumeMounts: [{ name: "workspace", mountPath: "/workspace" }]
          }
        ]
      }
    }
  }
});

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
  for (const container of ["context-exporter", "kaniko"]) {
    const text = await kubernetes
      .core()
      .readNamespacedPodLog({ namespace: config.templateBuilderNamespace, name: pod.metadata.name, container })
      .catch(() => "");
    if (!text) continue;
    await withClient(async (client) => {
      for (const line of text.split(/\r?\n/).filter(Boolean)) await appendBuildLog(client, buildId, "stdout", `[${container}] ${line}`);
    });
  }
};

const waitForJobDigest = async (build: BuildRow, jobName: string) => {
  const started = Date.now();
  while (Date.now() - started < config.templateBuilderJobTimeoutMs) {
    const job = await kubernetes.batch().readNamespacedJobStatus({ namespace: config.templateBuilderNamespace, name: jobName });
    if ((job.status?.succeeded ?? 0) > 0) {
      const pod = await podForJob(jobName);
      const message = pod?.status?.containerStatuses?.find((status) => status.name === "kaniko")?.state?.terminated?.message?.trim() ?? "";
      if (!/^sha256:[a-f0-9]{64}$/.test(message)) throw new Error(`kaniko did not report an image digest for ${build.id}`);
      return message;
    }
    if ((job.status?.failed ?? 0) > 0) {
      await appendJobLogs(build.id, jobName);
      throw new Error(`template build job ${jobName} failed`);
    }
    await sleep(2000);
  }
  await appendJobLogs(build.id, jobName);
  throw new Error(`template build job ${jobName} timed out`);
};

const dockerfileReadyImage = async (build: BuildRow): Promise<ReadyImage> => {
  if (!build.context_sha256) throw new Error(`build ${build.id} has no uploaded context`);
  const dockerfilePath = safeDockerfilePath(build.dockerfile_path);
  const tag = safeName(build.id);
  const pushRepository = buildRepository(build, config.templateRegistryPushHost);
  const runtimeRepository = buildRepository(build, config.templateRegistryRuntimeHost);
  const pushRef = `${pushRepository}:${tag}`;
  const jobName = jobNameFor(build.id);
  await appendBuildLogForBuild(build.id, `creating Kaniko job ${jobName}`);
  await kubernetes.batch().createNamespacedJob({
    namespace: config.templateBuilderNamespace,
    body: buildJob(build, pushRef, dockerfilePath)
  });
  const digest = await waitForJobDigest(build, jobName);
  await appendJobLogs(build.id, jobName);
  const imageUri = `${runtimeRepository}@${digest}`;
  await appendBuildLogForBuild(build.id, `pushed ${pushRef} as ${imageUri}`);
  return {
    imageUri,
    imageDigest: digest,
    metadata: {
      source: "dockerfile",
      dockerfilePath,
      contextHash: build.context_sha256,
      contextSizeBytes: build.context_size_bytes,
      contextFileCount: build.context_file_count,
      pushedImage: pushRef,
      runtimeImage: imageUri,
      builder: "kaniko"
    }
  };
};

const appendBuildLogForBuild = async (buildId: string, message: string, stream: "stdout" | "stderr" = "stdout") =>
  withClient((client) => appendBuildLog(client, buildId, stream, message));

const processBuild = async (sourceType: "image" | "dockerfile", readyImage: (build: BuildRow) => Promise<ReadyImage>) => {
  const build = await claimBuild(sourceType);
  if (!build) return null;
  try {
    const ready = await readyImage(build);
    const result = await completeBuild(build, ready);
    console.log(`template build ${build.id} completed as ${result.imageUri}`);
    return result;
  } catch (error) {
    await failBuild(build, error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`template build ${build.id} failed: ${message}`);
    return null;
  }
};

export const processNextTemplateBuild = async () =>
  (await processBuild("image", imageImportReadyImage)) ?? (await processBuild("dockerfile", dockerfileReadyImage));

export const processNextImageImportBuild = () => processBuild("image", imageImportReadyImage);

export const runTemplateBuilder = async () => {
  let shuttingDown = false;
  const stop = () => {
    shuttingDown = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    await processNextTemplateBuild();
    if (config.templateBuilderOnce) break;
    if (!shuttingDown) await sleep(config.templateBuilderPollMs);
  } while (!shuttingDown);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runTemplateBuilder()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDb();
    });
}

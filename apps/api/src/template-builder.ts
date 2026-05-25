import type { V1Node, V1Pod } from "@kubernetes/client-node";
import { recordAuditEvent } from "./audit.js";
import { config, logDeprecatedConfigWarnings } from "./config.js";
import { makeId } from "./crypto.js";
import { closeDb, withClient } from "./db.js";
import { kubernetes } from "./kubernetes.js";
import { registryCredentialForImage } from "./registry-credentials.js";
import { appendBuildLog } from "./build-logs.js";
import { redactRecord, redactText } from "./redaction.js";
import { buildKitKubernetesBuilder } from "./builders/buildkit-kubernetes-builder.js";
import { kanikoLegacyBuilder } from "./builders/kaniko-builder.js";
import { imageImportBuilder } from "./builders/image-import-builder.js";

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
  template_tags: string[];
  context_sha256?: string;
  context_size_bytes?: number;
  context_file_count?: number | null;
};

type ReadyImage = {
  imageUri: string;
  imageDigest: string;
  metadata: Record<string, unknown>;
};

type TemplateScanHookOptions = {
  webhookUrl?: string;
  timeoutMs?: number;
  failOnError?: boolean;
  fetchImpl?: typeof fetch;
};

type TemplateScanInput = {
  buildId: string;
  templateId: string;
  organizationId: string;
  sourceType: string;
  imageUri: string;
  imageDigest: string;
  provenance: Record<string, unknown>;
};

type TemplateScanResult = {
  status: string;
  summary: Record<string, unknown>;
};

type RuntimePullPreflightCore = {
  createNamespacedPod: (input: { namespace: string; body: V1Pod }) => Promise<unknown>;
  readNamespacedPodStatus: (input: { namespace: string; name: string }) => Promise<V1Pod>;
  deleteNamespacedPod: (input: { namespace: string; name: string; gracePeriodSeconds?: number; propagationPolicy?: string }) => Promise<unknown>;
};

type RuntimePullPreflightOptions = {
  enabled?: boolean;
  namespace?: string;
  timeoutMs?: number;
  core?: RuntimePullPreflightCore;
  sleepMs?: (ms: number) => Promise<void>;
};

type RuntimePullPreflightInput = {
  buildId: string;
  templateId: string;
  imageUri: string;
  imagePullSecretRef?: string | null;
};

type RuntimePullPreflightResult = {
  status: "ok" | "skipped";
  namespace?: string;
  podName?: string;
  imageID?: string | null;
  nodeName?: string | null;
  reason?: string | null;
  durationMs?: number;
};

type RuntimeImagePrepullCore = RuntimePullPreflightCore & {
  listNode: (input?: { labelSelector?: string }) => Promise<{ items?: V1Node[] }>;
};

type RuntimeImagePrepullOptions = RuntimePullPreflightOptions & {
  hotTags?: string[];
  failOnError?: boolean;
};

type RuntimeImagePrepullInput = RuntimePullPreflightInput & {
  templateTags?: string[];
  metadata?: Record<string, unknown>;
};

type RuntimeImagePrepullResult = {
  status: "ok" | "skipped" | "failed";
  namespace?: string;
  podNames?: string[];
  nodeNames?: string[];
  imageIDs?: Array<string | null>;
  hotTags?: string[];
  reason?: string | null;
  durationMs?: number;
};

const provenanceFor = (build: BuildRow, ready: ReadyImage) => {
  const builderKind = ready.metadata.builder ?? (build.source_type === "dockerfile" ? config.templateDockerfileBuilder : "image-import");
  return {
    source: ready.metadata.source ?? build.source_type,
    sourceType: build.source_type,
    buildId: build.id,
    templateId: build.template_id,
    organizationId: build.organization_id,
    imageUri: ready.imageUri,
    imageDigest: ready.imageDigest,
    contextHash: build.context_sha256 ?? build.context_hash ?? null,
    dockerfilePath: build.dockerfile_path,
    builderKind,
    builder: {
      kind: builderKind,
      startedAt: ready.metadata.builderStartedAt ?? null,
      completedAt: ready.metadata.builderCompletedAt ?? null,
      details: ready.metadata.builderDetails ?? null
    },
    runtimePullPreflight: ready.metadata.runtimePullPreflight ?? null,
    runtimeImagePrepull: ready.metadata.runtimeImagePrepull ?? null,
    registryRepositoryPrefix: config.templateRegistryRepositoryPrefix
  };
};

const scannerNotConfigured = (): TemplateScanResult => ({
  status: "not_scanned",
  summary: { status: "not_scanned", reason: "scanner_not_configured" }
});

const normalizeScanStatus = (value: unknown) => {
  if (typeof value !== "string") return "scanned";
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.slice(0, 64) || "scanned";
};

const recordFromUnknown = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const scanTemplateImage = async (input: TemplateScanInput, options: TemplateScanHookOptions = {}): Promise<TemplateScanResult> => {
  const webhookUrl = options.webhookUrl ?? config.templateScannerWebhookUrl;
  if (!webhookUrl) return scannerNotConfigured();

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? config.templateScannerTimeoutMs;
  const failOnError = options.failOnError ?? config.templateScannerFailOnError;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    const body = recordFromUnknown(parsed);
    if (!response.ok) {
      const summary = redactRecord({ status: "scan_failed", reason: "scanner_http_error", statusCode: response.status, body });
      if (failOnError) throw new Error(`template scanner returned HTTP ${response.status}`);
      return { status: "scan_failed", summary };
    }
    const status = normalizeScanStatus(body.status);
    return { status, summary: redactRecord({ ...body, status }) };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error));
    if (failOnError) throw new Error(`template scanner failed: ${message}`);
    return {
      status: "scan_failed",
      summary: redactRecord({ status: "scan_failed", reason: "scanner_error", error: message })
    };
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const safeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "template";

const appendBuildLogForBuild = async (buildId: string, message: string, stream: "stdout" | "stderr" = "stdout") =>
  withClient((client) => appendBuildLog(client, buildId, stream, message));

const runtimePullFailureReasons = new Set(["ErrImagePull", "ImagePullBackOff", "InvalidImageName", "RegistryUnavailable"]);
const postPullFailureReasons = new Set(["CreateContainerError", "RunContainerError", "ContainerCannotRun", "CrashLoopBackOff"]);

const preflightPodNameFor = (buildId: string) => `hkpull-${safeName(buildId)}`;
const prepullPodNameFor = (buildId: string, nodeName: string, index: number) =>
  `hkprep-${safeName(buildId).slice(0, 26)}-${index}-${safeName(nodeName).slice(0, 20)}`.slice(0, 63).replace(/-+$/g, "");

const preflightPodFor = (input: RuntimePullPreflightInput, namespace: string): V1Pod => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: preflightPodNameFor(input.buildId),
    namespace,
    labels: {
      app: "harakiri-template-pull-preflight",
      "harakiri.build": safeName(input.buildId),
      "harakiri.template": safeName(input.templateId)
    },
    annotations: {
      "harakiri.io/build-id": input.buildId,
      "harakiri.io/template-id": input.templateId,
      "harakiri.io/image-uri": input.imageUri
    }
  },
  spec: {
    restartPolicy: "Never",
    terminationGracePeriodSeconds: 0,
    containers: [
      {
        name: "pull",
        image: input.imageUri,
        imagePullPolicy: "Always",
        command: ["/bin/sh", "-c", "true"]
      }
    ],
    imagePullSecrets: input.imagePullSecretRef ? [{ name: input.imagePullSecretRef }] : undefined
  }
});

const prepullPodFor = (input: RuntimePullPreflightInput, namespace: string, nodeName: string, index: number): V1Pod => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: prepullPodNameFor(input.buildId, nodeName, index),
    namespace,
    labels: {
      app: "harakiri-template-image-prepull",
      "harakiri.build": safeName(input.buildId),
      "harakiri.template": safeName(input.templateId)
    },
    annotations: {
      "harakiri.io/build-id": input.buildId,
      "harakiri.io/template-id": input.templateId,
      "harakiri.io/image-uri": input.imageUri,
      "harakiri.io/node-name": nodeName
    }
  },
  spec: {
    restartPolicy: "Never",
    terminationGracePeriodSeconds: 0,
    nodeName,
    tolerations: [{ operator: "Exists" }],
    containers: [
      {
        name: "pull",
        image: input.imageUri,
        imagePullPolicy: "Always",
        command: ["/bin/sh", "-c", "true"]
      }
    ],
    imagePullSecrets: input.imagePullSecretRef ? [{ name: input.imagePullSecretRef }] : undefined
  }
});

export const runtimePullPreflightState = (pod: V1Pod) => {
  const status = pod.status?.containerStatuses?.find((item) => item.name === "pull") ?? pod.status?.containerStatuses?.[0];
  const waiting = status?.state?.waiting;
  const terminated = status?.state?.terminated;
  const imageID = status?.imageID ?? null;
  const nodeName = pod.spec?.nodeName ?? null;
  if (imageID || status?.state?.running || terminated) {
    return { done: true, ok: true, imageID, nodeName, reason: terminated?.reason ?? waiting?.reason ?? pod.status?.phase ?? null };
  }
  if (waiting?.reason && runtimePullFailureReasons.has(waiting.reason)) {
    return { done: true, ok: false, imageID, nodeName, reason: waiting.reason, message: waiting.message ?? null };
  }
  if (waiting?.reason && postPullFailureReasons.has(waiting.reason)) {
    return { done: true, ok: true, imageID, nodeName, reason: waiting.reason };
  }
  if (pod.status?.phase === "Failed") {
    return { done: true, ok: false, imageID, nodeName, reason: pod.status.reason ?? waiting?.reason ?? "PodFailed", message: pod.status.message ?? waiting?.message ?? null };
  }
  return { done: false, ok: false, imageID, nodeName, reason: waiting?.reason ?? pod.status?.phase ?? null };
};

export const preflightTemplateImagePull = async (
  input: RuntimePullPreflightInput,
  options: RuntimePullPreflightOptions = {}
): Promise<RuntimePullPreflightResult> => {
  const enabled = options.enabled ?? config.templateRuntimePullPreflightEnabled;
  if (!enabled) return { status: "skipped", reason: "disabled" };
  const namespace = options.namespace ?? config.templateRuntimePullPreflightNamespace;
  const timeoutMs = options.timeoutMs ?? config.templateRuntimePullPreflightTimeoutMs;
  const core = options.core ?? kubernetes.core();
  const sleepImpl = options.sleepMs ?? sleep;
  const podName = preflightPodNameFor(input.buildId);
  const started = Date.now();
  await core.deleteNamespacedPod({ namespace, name: podName, gracePeriodSeconds: 0, propagationPolicy: "Background" }).catch(() => undefined);
  await core.createNamespacedPod({ namespace, body: preflightPodFor(input, namespace) });
  try {
    while (Date.now() - started < timeoutMs) {
      const pod = await core.readNamespacedPodStatus({ namespace, name: podName });
      const state = runtimePullPreflightState(pod);
      if (state.done && state.ok) {
        return {
          status: "ok",
          namespace,
          podName,
          imageID: state.imageID,
          nodeName: state.nodeName,
          reason: state.reason,
          durationMs: Date.now() - started
        };
      }
      if (state.done && !state.ok) {
        throw new Error(`runtime image pull preflight failed for ${input.imageUri}: ${state.reason}${state.message ? ` - ${state.message}` : ""}`);
      }
      await sleepImpl(1000);
    }
    throw new Error(`runtime image pull preflight timed out after ${timeoutMs}ms for ${input.imageUri}`);
  } finally {
    await core.deleteNamespacedPod({ namespace, name: podName, gracePeriodSeconds: 0, propagationPolicy: "Background" }).catch(() => undefined);
  }
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

const metadataFlagEnabled = (value: unknown) =>
  value === true || value === 1 || (typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));

export const templateShouldPrepull = (
  input: { template_tags?: string[]; metadata?: Record<string, unknown> },
  hotTags = config.templateImagePrepullHotTags
) => {
  const tags = new Set((input.template_tags ?? []).map(normalizeTag).filter(Boolean));
  const requestedByTag = hotTags.map(normalizeTag).some((tag) => tags.has(tag));
  const metadata = recordFromUnknown(input.metadata);
  const requestedByMetadata = ["prepull", "imagePrepull", "warm", "hot", "warmPool"].some((key) => metadataFlagEnabled(metadata[key]));
  return requestedByTag || requestedByMetadata;
};

const nodeReady = (node: V1Node) => {
  if (node.spec?.unschedulable) return false;
  const readyCondition = node.status?.conditions?.find((condition) => condition.type === "Ready");
  return !readyCondition || readyCondition.status === "True";
};

const prepullableNodeNames = (nodes: V1Node[]) =>
  nodes
    .filter(nodeReady)
    .map((node) => node.metadata?.name)
    .filter((name): name is string => Boolean(name));

const waitForPrepullPod = async (input: {
  core: RuntimeImagePrepullCore;
  namespace: string;
  podName: string;
  imageUri: string;
  timeoutMs: number;
  started: number;
  sleepMs: (ms: number) => Promise<void>;
}) => {
  while (Date.now() - input.started < input.timeoutMs) {
    const pod = await input.core.readNamespacedPodStatus({ namespace: input.namespace, name: input.podName });
    const state = runtimePullPreflightState(pod);
    if (state.done && state.ok) return state;
    if (state.done && !state.ok) {
      throw new Error(`runtime image pre-pull failed for ${input.imageUri}: ${state.reason}${state.message ? ` - ${state.message}` : ""}`);
    }
    await input.sleepMs(1000);
  }
  throw new Error(`runtime image pre-pull timed out after ${input.timeoutMs}ms for ${input.imageUri}`);
};

export const prepullTemplateImage = async (
  input: RuntimeImagePrepullInput,
  options: RuntimeImagePrepullOptions = {}
): Promise<RuntimeImagePrepullResult> => {
  const enabled = options.enabled ?? config.templateImagePrepullEnabled;
  if (!enabled) return { status: "skipped", reason: "disabled" };
  const hotTags = options.hotTags ?? config.templateImagePrepullHotTags;
  if (!templateShouldPrepull({ template_tags: input.templateTags, metadata: input.metadata }, hotTags)) {
    return { status: "skipped", reason: "not_hot_template", hotTags };
  }
  const namespace = options.namespace ?? config.templateImagePrepullNamespace;
  const timeoutMs = options.timeoutMs ?? config.templateImagePrepullTimeoutMs;
  const failOnError = options.failOnError ?? config.templateImagePrepullFailOnError;
  const core = (options.core ?? kubernetes.core()) as RuntimeImagePrepullCore;
  const sleepImpl = options.sleepMs ?? sleep;
  const started = Date.now();
  const podNames: string[] = [];
  const imageIDs: Array<string | null> = [];

  try {
    const nodeNames = prepullableNodeNames((await core.listNode()).items ?? []);
    if (!nodeNames.length) return { status: "skipped", namespace, reason: "no_ready_nodes", hotTags, durationMs: Date.now() - started };

    for (let index = 0; index < nodeNames.length; index += 1) {
      const nodeName = nodeNames[index];
      const podName = prepullPodNameFor(input.buildId, nodeName, index);
      podNames.push(podName);
      await core.deleteNamespacedPod({ namespace, name: podName, gracePeriodSeconds: 0, propagationPolicy: "Background" }).catch(() => undefined);
      await core.createNamespacedPod({ namespace, body: prepullPodFor(input, namespace, nodeName, index) });
      const state = await waitForPrepullPod({
        core,
        namespace,
        podName,
        imageUri: input.imageUri,
        timeoutMs,
        started,
        sleepMs: sleepImpl
      });
      imageIDs.push(state.imageID);
    }

    return { status: "ok", namespace, podNames, nodeNames, imageIDs, hotTags, durationMs: Date.now() - started };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error));
    if (failOnError) throw new Error(message);
    return { status: "failed", namespace, podNames, imageIDs, hotTags, reason: message, durationMs: Date.now() - started };
  } finally {
    await Promise.all(
      podNames.map((podName) => core.deleteNamespacedPod({ namespace, name: podName, gracePeriodSeconds: 0, propagationPolicy: "Background" }).catch(() => undefined))
    );
  }
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
                t.tags AS template_tags,
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

const completeBuild = async (build: BuildRow, ready: ReadyImage) => {
  await appendBuildLogForBuild(build.id, `preflighting runtime image pull ${ready.imageUri}`);
  const runtimeCredential = await registryCredentialForImage(build.organization_id, ready.imageUri, "pull");
  const imagePullSecretRef = runtimeCredential?.pullSecretRef ?? runtimeCredential?.secretRef ?? null;
  const runtimePullPreflight = await preflightTemplateImagePull({
    buildId: build.id,
    templateId: build.template_id,
    imageUri: ready.imageUri,
    imagePullSecretRef
  });
  const runtimeImagePrepull = await prepullTemplateImage({
    buildId: build.id,
    templateId: build.template_id,
    imageUri: ready.imageUri,
    imagePullSecretRef,
    templateTags: build.template_tags,
    metadata: build.metadata
  });
  const readyWithPreflight = {
    ...ready,
    metadata: redactRecord({
      ...ready.metadata,
      runtimePullPreflight,
      runtimeImagePrepull,
      runtimePullCredentialId: runtimeCredential?.id ?? null,
      runtimePullSecretRef: imagePullSecretRef
    })
  };
  await appendBuildLogForBuild(build.id, runtimePullPreflight.status === "ok" ? `runtime image pull preflight ok in ${runtimePullPreflight.durationMs}ms` : "runtime image pull preflight skipped");
  if (runtimeImagePrepull.status === "ok") {
    await appendBuildLogForBuild(build.id, `runtime image pre-pull ok on ${runtimeImagePrepull.nodeNames?.length ?? 0} nodes in ${runtimeImagePrepull.durationMs}ms`);
  } else if (runtimeImagePrepull.status === "failed") {
    await appendBuildLogForBuild(build.id, `runtime image pre-pull failed: ${runtimeImagePrepull.reason ?? "unknown"}`, "stderr");
  } else {
    await appendBuildLogForBuild(build.id, `runtime image pre-pull skipped: ${runtimeImagePrepull.reason ?? "not configured"}`);
  }
  const provenance = redactRecord(provenanceFor(build, readyWithPreflight));
  const scan = await scanTemplateImage({
    buildId: build.id,
    templateId: build.template_id,
    organizationId: build.organization_id,
    sourceType: build.source_type,
    imageUri: readyWithPreflight.imageUri,
    imageDigest: readyWithPreflight.imageDigest,
    provenance
  });

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const current = await client.query<{ status: string }>(
        `SELECT b.status
         FROM template_builds b
         JOIN templates t ON t.id = b.template_id
         WHERE b.id = $1
         FOR UPDATE OF b, t`,
        [build.id]
      );
      if (current.rows[0]?.status === "canceled") {
        await appendBuildLog(client, build.id, "stdout", "builder result ignored because build was canceled");
        await client.query("COMMIT");
        return { versionId: null, digest: ready.imageDigest, imageUri: ready.imageUri, skipped: true };
      }

      const version = await client.query<{ next: number }>("SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM template_versions WHERE template_id = $1", [build.template_id]);
      const versionId = makeId("tplv", 12);
      const versionNumber = Number(version.rows[0]?.next ?? 1);
      await client.query(
        `INSERT INTO template_versions
         (id, template_id, organization_id, build_id, version_number, aliases,
          image_uri, image_digest, status, default_entrypoint, cpu_count, memory_mb,
          workdir, default_ports, metadata, provenance, scan_status, scan_summary, promoted_at)
         VALUES ($1, $2, $3, $4, $5, ARRAY['latest'], $6, $7, 'ready', $8, $9, $10, $11, $12, $13, $14, $15, $16, now())`,
        [
          versionId,
          build.template_id,
          build.organization_id,
          build.id,
          versionNumber,
          readyWithPreflight.imageUri,
          readyWithPreflight.imageDigest,
          build.template_default_entrypoint,
          build.template_cpu_count,
          build.template_memory_mb,
          build.template_workdir,
          build.template_default_ports,
          redactRecord({ ...build.metadata, ...readyWithPreflight.metadata }),
          provenance,
          scan.status,
          scan.summary
        ]
      );
      await client.query(
        `UPDATE templates
         SET latest_version_id = CASE WHEN status = 'archived' THEN latest_version_id ELSE $2 END,
             image = CASE WHEN status = 'archived' THEN image ELSE $3 END,
             image_digest = CASE WHEN status = 'archived' THEN image_digest ELSE $4 END,
             status = CASE WHEN status = 'archived' THEN status ELSE 'ready' END,
             updated_at = now()
         WHERE id = $1`,
        [build.template_id, versionId, readyWithPreflight.imageUri, readyWithPreflight.imageDigest]
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
        [build.id, readyWithPreflight.imageUri, readyWithPreflight.imageDigest, JSON.stringify(redactRecord({ templateVersionId: versionId, ...readyWithPreflight.metadata, readyImage: readyWithPreflight.metadata }))]
      );
      await appendBuildLog(client, build.id, "stdout", `created template version ${versionId}`);
      await recordAuditEvent(
        {
          organizationId: build.organization_id,
          actorUserId: null,
          actorLabel: "harakiri-template-builder",
          action: "template.build.success",
          targetType: "template_build",
          targetId: build.id,
          metadata: {
            templateId: build.template_id,
            sourceType: build.source_type,
            versionId,
            imageUri: readyWithPreflight.imageUri,
            imageDigest: readyWithPreflight.imageDigest,
            runtimePullPreflight,
            runtimeImagePrepull
          }
        },
        client
      );
      await client.query("COMMIT");
      return { versionId, digest: readyWithPreflight.imageDigest, imageUri: readyWithPreflight.imageUri, skipped: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
};

const failBuild = async (build: BuildRow, error: unknown) =>
  withClient(async (client) => {
    const message = redactText(error instanceof Error ? error.message : String(error));
    await client.query("BEGIN");
    try {
      const failed = await client.query<{ id: string }>(
        `UPDATE template_builds
         SET status = 'failed',
             error = $2,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1 AND status <> 'canceled'
         RETURNING id`,
        [build.id, message]
      );
      if (!failed.rowCount) {
        await appendBuildLog(client, build.id, "stderr", `ignored failure after cancellation: ${message}`);
        await client.query("COMMIT");
        return;
      }
      await appendBuildLog(client, build.id, "stderr", message);
      await recordAuditEvent(
        {
          organizationId: build.organization_id,
          actorUserId: null,
          actorLabel: "harakiri-template-builder",
          action: "template.build.failed",
          targetType: "template_build",
          targetId: build.id,
          metadata: {
            templateId: build.template_id,
            sourceType: build.source_type,
            error: message
          }
        },
        client
      );
      await client.query("COMMIT");
    } catch (rollbackError) {
      await client.query("ROLLBACK");
      throw rollbackError;
    }
  });

const imageImportReadyImage = async (build: BuildRow): Promise<ReadyImage> => {
  const imageRef = build.image_destination ?? build.template_image;
  const result = await imageImportBuilder.build({
    buildId: build.id,
    organizationId: build.organization_id,
    templateId: build.template_id,
    source: { type: "image", imageUri: imageRef },
    metadata: build.metadata
  });
  return {
    imageUri: result.imageUri,
    imageDigest: result.imageDigest,
    metadata: {
      source: "image-import",
      requestedImage: imageRef,
      resolvedImage: result.imageUri,
      builder: result.provenance.builder,
      builderDetails: result.provenance.details,
      builderStartedAt: result.provenance.startedAt,
      builderCompletedAt: result.provenance.completedAt
    }
  };
};

const dockerfileImageBuilder = () => {
  if (config.templateDockerfileBuilder === "buildkit") {
    return buildKitKubernetesBuilder;
  }
  if (config.templateDockerfileBuilder === "kaniko-legacy") {
    return kanikoLegacyBuilder;
  }
  throw new Error(`unsupported Dockerfile builder: ${config.templateDockerfileBuilder}`);
};

const dockerfileReadyImage = async (build: BuildRow): Promise<ReadyImage> => {
  const result = await dockerfileImageBuilder().build({
    buildId: build.id,
    organizationId: build.organization_id,
    templateId: build.template_id,
    source: {
      type: "dockerfile",
      contextRef: build.context_sha256 ?? "",
      dockerfilePath: build.dockerfile_path ?? "Dockerfile",
      buildArgs: {}
    },
    metadata: {
      ...build.metadata,
      contextSizeBytes: build.context_size_bytes,
      contextFileCount: build.context_file_count
    }
  });
  const details = result.provenance.details ?? {};
  return {
    imageUri: result.imageUri,
    imageDigest: result.imageDigest,
    metadata: {
      source: "dockerfile",
      ...details,
      builder: result.provenance.builder,
      builderDetails: details,
      builderStartedAt: result.provenance.startedAt,
      builderCompletedAt: result.provenance.completedAt
    }
  };
};

const processBuild = async (sourceType: "image" | "dockerfile", readyImage: (build: BuildRow) => Promise<ReadyImage>) => {
  const build = await claimBuild(sourceType);
  if (!build) return null;
  try {
    const ready = await readyImage(build);
    const result = await completeBuild(build, ready);
    console.log(result.skipped ? `template build ${build.id} result ignored after cancellation` : `template build ${build.id} completed as ${result.imageUri}`);
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
  logDeprecatedConfigWarnings();
  runTemplateBuilder()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDb();
    });
}

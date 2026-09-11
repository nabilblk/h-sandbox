import { sandboxRuntimeApiErrorCodes } from "./api-errors.js";
import { apiKeyScopes } from "./authorization.js";

type JsonSchema = Record<string, unknown>;

type Operation = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security?: Array<Record<string, string[]>>;
  parameters?: JsonSchema[];
  requestBody?: JsonSchema;
  responses: Record<string, JsonSchema>;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const objectSchema = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});

const freeObject = { type: "object", additionalProperties: true };
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const integer = { type: "integer" };
const number = { type: "number" };
const boolean = { type: "boolean" };
const dateTime = { type: "string", format: "date-time" };
const credentialProviderPresetId = {
  type: "string",
  enum: ["openai", "anthropic", "openrouter", "github", "gitlab", "npm", "pypi-publish"]
};
const credentialProviderProfileId = {
  type: "string",
  enum: [...credentialProviderPresetId.enum, "custom"]
};

const arrayOf = (items: JsonSchema) => ({ type: "array", items });

const parameter = (name: string, location: "path" | "query" | "header", schema: JsonSchema, required = location === "path") => ({
  name,
  in: location,
  required,
  schema
});

const jsonBody = (schema: JsonSchema, required = true) => ({
  required,
  content: {
    "application/json": {
      schema
    }
  }
});

const jsonResponse = (description: string, schema: JsonSchema) => ({
  description,
  content: {
    "application/json": {
      schema
    }
  }
});

const ok = (description: string, schema: JsonSchema) => ({ "200": jsonResponse(description, schema) });
const created = (description: string, schema: JsonSchema) => ({ "201": jsonResponse(description, schema) });
const accepted = (description: string, schema: JsonSchema) => ({ "202": jsonResponse(description, schema) });
const noContent = (description = "Deleted") => ({ "200": jsonResponse(description, ref("OkResponse")) });

const authErrorResponses = {
  "400": jsonResponse("Bad request", ref("ApiErrorResponse")),
  "401": jsonResponse("Unauthorized", ref("ApiErrorResponse")),
  "403": jsonResponse("Forbidden", ref("ApiErrorResponse")),
  "404": jsonResponse("Not found", ref("ApiErrorResponse")),
  "409": jsonResponse("Conflict", ref("ApiErrorResponse")),
  "422": jsonResponse("Validation or policy error", ref("ApiErrorResponse")),
  "429": jsonResponse("Rate limited. Execution capacity uses 409.", ref("ApiErrorResponse")),
  "500": jsonResponse("Server error", ref("ApiErrorResponse"))
};

const capacityErrorResponses = {
  "409": jsonResponse("organization_capacity_exceeded: no execution was admitted; stop work or raise the limit. idempotency_conflict: key reused for a different intent. sandbox_transition_in_progress: existing runtime effect must settle.", ref("ApiErrorResponse")),
  "503": jsonResponse("organization_capacity_unavailable: inventory is unverified or unavailable; no new execution was admitted.", ref("ApiErrorResponse"))
};

const secured = (operation: Operation): Operation => ({
  security: operation.tags.some((tag) => ["Account", "Members", "API Keys"].includes(tag)) || operation.operationId === "updateOrganizationSettings"
    ? [{ bearerAuth: [] }] : [{ apiKey: [] }, { bearerAuth: [] }],
  ...operation
});

const pathId = parameter("id", "path", string);
const commandIdPath = parameter("commandId", "path", string);
const sessionIdPath = parameter("sessionId", "path", string);
const portPath = parameter("port", "path", integer);
const snapshotIdPath = parameter("snapshotId", "path", string);
const templateIdPath = parameter("id", "path", string);
const buildIdPath = parameter("id", "path", string);
const credentialIdPath = parameter("id", "path", string);
const attachmentIdPath = parameter("attachmentId", "path", string);

const schemas: Record<string, JsonSchema> = {
  WorkspaceSummary: objectSchema({
    id: string, name: string, sizeGiB: integer, mountPath: { const: "/workspace" },
    status: { type: "string", enum: ["available", "attached", "releasing", "recovery_required", "archived"] },
    attachedSandboxId: nullableString, storageRequested: boolean, archivedAt: { type: ["string", "null"], format: "date-time" }, createdAt: dateTime, updatedAt: dateTime
  }),
  WorkspacePolicy: objectSchema({ available: boolean, reason: nullableString, sizeGiB: integer, maxPerOrganization: integer, mountPath: { const: "/workspace" }, retention: { const: "until_operator_reclaims" }, physicalDeletion: { const: false } }),
  CreateWorkspaceBody: objectSchema({ name: { type: "string", minLength: 1, maxLength: 80 } }),
  WorkspaceResponse: objectSchema({ workspace: ref("WorkspaceSummary") }),
  WorkspacesResponse: objectSchema({ workspaces: arrayOf(ref("WorkspaceSummary")), policy: ref("WorkspacePolicy") }),
  SandboxCommandEvent: { oneOf: [
    objectSchema({ type: { const: "output" }, commandId: string, cursor: string, stdout: string, stderr: string }),
    objectSchema({ type: { const: "status" }, commandId: string, cursor: string, status: { enum: ["queued", "running", "succeeded", "failed", "killed"] }, exitCode: { type: ["integer", "null"] } }),
    objectSchema({ type: { const: "complete" }, commandId: string, cursor: string, status: { enum: ["succeeded", "failed", "killed"] }, exitCode: { type: ["integer", "null"] } }),
    objectSchema({ type: { const: "reconnect" }, commandId: string, cursor: string }),
    objectSchema({ type: { const: "error" }, commandId: string, cursor: string, code: string, message: string })
  ] },
  ApiErrorResponse: objectSchema({
    error: {
      ...string,
      description: "Stable machine-readable error code. Sandbox runtime endpoints use the SandboxRuntimeApiErrorCode vocabulary."
    },
    message: string,
    capacity: ref("OrganizationCapacity"),
    sandboxId: string, operationId: string
  }, ["error"]),
  SandboxRuntimeApiErrorCode: {
    type: "string",
    enum: [...sandboxRuntimeApiErrorCodes],
    description: "Stable error codes used or reserved by public sandbox runtime endpoints."
  },
  OkResponse: objectSchema({ ok: boolean }),
  HealthResponse: objectSchema({ status: { type: "string", enum: ["ok"] } }),
  BootstrapResponse: objectSchema({
    apiUrl: string,
    keycloak: objectSchema({
      url: string,
      realm: string,
      clientId: string
    })
  }),
  PageSummary: objectSchema({
    total: integer,
    limit: integer,
    offset: integer
  }),
  AuditEventSummary: objectSchema({
    id: string,
    actorUserId: nullableString,
    actorLabel: string,
    action: string,
    targetType: string,
    targetId: nullableString,
    metadata: freeObject,
    createdAt: dateTime
  }),
  AuditEventsResponse: objectSchema({
    events: arrayOf(ref("AuditEventSummary")),
    page: ref("PageSummary")
  }),
  Template: objectSchema({
    id: string,
    name: string,
    description: string,
    image: string,
    imageDigest: nullableString,
    icon: { type: "string", enum: ["py", "node", "globe", "box", "file"] },
    tags: arrayOf(string),
    aliases: arrayOf(string),
    bootMs: integer,
    visibility: { type: "string", enum: ["public", "private", "internal"] },
    status: string,
    ownerScope: { type: "string", enum: ["platform", "team"] },
    defaultEntrypoint: arrayOf(string),
    cpuCount: integer,
    memoryMb: integer,
    workdir: string,
    defaultPorts: arrayOf(integer),
    runtimeFamily: string,
    egressPolicy: ref("EgressPolicyInput"),
    credentialSlots: arrayOf(ref("TemplateCredentialSlot")),
    latestVersionId: nullableString,
    latestBuildId: nullableString,
    latestBuildStatus: nullableString,
    latestBuildCreatedAt: nullableString,
    createdAt: dateTime,
    updatedAt: dateTime
  }, ["id", "name", "description", "image", "icon", "tags", "aliases", "bootMs", "visibility", "status", "defaultEntrypoint", "cpuCount", "memoryMb", "workdir", "defaultPorts", "runtimeFamily"]),
  TemplatesResponse: objectSchema({
    templates: arrayOf(ref("Template")),
    page: ref("PageSummary")
  }, ["templates"]),
  TemplateResponse: objectSchema({ template: ref("Template") }),
  CreateTemplateBody: objectSchema({
    id: string,
    name: string,
    description: string,
    image: string,
    icon: { type: "string", enum: ["py", "node", "globe", "box", "file"] },
    tags: arrayOf(string),
    aliases: arrayOf(string),
    visibility: { type: "string", enum: ["public", "private", "internal"] },
    defaultEntrypoint: arrayOf(string),
    cpuCount: integer,
    memoryMb: integer,
    workdir: string,
    defaultPorts: arrayOf(integer),
    runtimeFamily: string,
    egressPolicy: ref("EgressPolicyInput"),
    credentialSlots: arrayOf(ref("TemplateCredentialSlotInput"))
  }, ["name"]),
  UpdateTemplateEgressBody: objectSchema({
    egressPolicy: ref("EgressPolicyInput")
  }, ["egressPolicy"]),
  PromoteTemplateBody: objectSchema({
    versionId: string,
    alias: string
  }, ["versionId"]),
  TemplateVersionSummary: objectSchema({
    id: string,
    templateId: string,
    buildId: nullableString,
    versionNumber: integer,
    aliases: arrayOf(string),
    imageUri: string,
    imageDigest: nullableString,
    status: string,
    defaultEntrypoint: arrayOf(string),
    cpuCount: integer,
    memoryMb: integer,
    workdir: string,
    defaultPorts: arrayOf(integer),
    egressPolicy: ref("EgressPolicyInput"),
    credentialSlots: arrayOf(ref("TemplateCredentialSlot")),
    envSchema: freeObject,
    metadata: freeObject,
    sbomRef: nullableString,
    provenance: freeObject,
    scanStatus: string,
    scanSummary: freeObject,
    createdAt: dateTime,
    promotedAt: { type: ["string", "null"], format: "date-time" }
  }),
  TemplateVersionsResponse: objectSchema({ versions: arrayOf(ref("TemplateVersionSummary")) }),
  TemplateCredentialSlotInput: objectSchema({
    id: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: ref("CustomCredentialProfileInput"),
    required: boolean,
    label: string,
    description: string,
    envName: string
  }, ["providerPresetId"]),
  TemplateCredentialSlot: objectSchema({
    id: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: { anyOf: [ref("CustomCredentialProfile"), { type: "null" }] },
    credentialName: string,
    required: boolean,
    label: string,
    description: string,
    envName: string,
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: ref("CredentialVaultBinding"),
    egressDomains: arrayOf(string),
    test: ref("CredentialProviderPresetTest")
  }),
  TemplateBuildSummary: objectSchema({
    id: string,
    organizationId: string,
    templateId: string,
    status: string,
    sourceType: string,
    contextHash: nullableString,
    dockerfilePath: nullableString,
    buildArgs: freeObject,
    imageDestination: nullableString,
    imageDigest: nullableString,
    resultVersionId: nullableString,
    logRef: nullableString,
    error: nullableString,
    metadata: freeObject,
    context: { anyOf: [ref("TemplateBuildContextSummary"), { type: "null" }] },
    startedAt: { type: ["string", "null"], format: "date-time" },
    completedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  TemplateBuildResponse: objectSchema({ build: ref("TemplateBuildSummary") }),
  TemplateBuildsResponse: objectSchema({ builds: arrayOf(ref("TemplateBuildSummary")) }),
  CreateTemplateBuildBody: objectSchema({
    sourceType: { type: "string", enum: ["dockerfile", "git", "image"] },
    contextHash: string,
    dockerfilePath: string,
    buildArgs: freeObject,
    imageDestination: string,
    metadata: freeObject
  }, []),
  TemplateBuildLogEntry: objectSchema({
    lineNo: integer,
    stream: string,
    message: string,
    createdAt: dateTime
  }),
  TemplateBuildLogsResponse: objectSchema({ logs: arrayOf(ref("TemplateBuildLogEntry")) }),
  UploadTemplateBuildContextBody: objectSchema({
    archiveBase64: string,
    sha256: string,
    sizeBytes: integer,
    format: { type: "string", enum: ["tar+gzip"] },
    fileCount: integer,
    metadata: freeObject
  }, ["archiveBase64", "sha256", "sizeBytes"]),
  TemplateBuildContextSummary: objectSchema({
    buildId: string,
    sha256: string,
    sizeBytes: integer,
    format: string,
    fileCount: { type: ["integer", "null"] },
    metadata: freeObject,
    uploadedAt: dateTime
  }, ["buildId", "sha256", "sizeBytes", "format", "fileCount", "uploadedAt"]),
  TemplateBuildContextResponse: objectSchema({ context: ref("TemplateBuildContextSummary") }),
  SandboxGitSourceInput: objectSchema({
    type: { type: "string", enum: ["git"] },
    url: string,
    branch: string,
    commit: string,
    targetPath: string,
    depth: integer,
    shallow: boolean,
    submodules: { oneOf: [boolean, { type: "string", enum: ["recursive"] }] },
    credentialPersistence: { type: "string", enum: ["one-shot", "dangerously-store-in-remote"] },
    applyEgressPreset: boolean,
    timeoutMs: integer
  }, ["type", "url"]),
  SandboxSourceInput: ref("SandboxGitSourceInput"),
  SandboxGitSourceProvenance: objectSchema({
    type: { type: "string", enum: ["git"] },
    url: string,
    branch: string,
    commit: string,
    targetPath: string,
    depth: integer,
    shallow: boolean,
    submodules: { oneOf: [boolean, { type: "string", enum: ["recursive"] }] },
    credentialPersistence: { type: "string", enum: ["one-shot", "dangerously-store-in-remote"] },
    status: { type: "string", enum: ["requested", "cloning", "ready", "failed"] },
    startedAt: { type: ["string", "null"], format: "date-time" },
    completedAt: { type: ["string", "null"], format: "date-time" },
    durationMs: { type: ["integer", "null"] },
    failureReason: nullableString
  }, ["type", "url", "targetPath", "status"]),
  SandboxSourceProvenance: ref("SandboxGitSourceProvenance"),
  PatchSandboxSourceBody: objectSchema({
    source: { oneOf: [ref("SandboxSourceProvenance"), { type: "null" }] }
  }, ["source"]),
  SandboxRuntimeRouteMetadata: objectSchema({
    port: integer,
    protocol: { type: "string", enum: ["http", "https"] },
    accessMode: { type: "string", enum: ["public", "token"] },
    state: { type: "string", enum: ["provisioning", "ready", "unhealthy", "terminated"] },
    host: string,
    url: string,
    labels: arrayOf(string)
  }),
  SandboxRuntimeMetadata: objectSchema({
    workdir: string,
    user: string,
    shell: string,
    template: objectSchema({
      id: string,
      versionId: nullableString,
      imageDigest: nullableString,
      runtimeFamily: string
    }),
    ports: objectSchema({
      default: arrayOf(integer),
      exposed: arrayOf(ref("SandboxRuntimeRouteMetadata"))
    }),
    routes: objectSchema({
      mode: string,
      baseDomain: string,
      publicScheme: string,
      defaultAccessMode: { type: "string", enum: ["public", "token"] },
      maxRoutesPerSandbox: integer,
      maxRoutesPerOrg: integer
    }),
    egress: objectSchema({
      mode: { type: "string", enum: ["open", "restricted", "blocked", "custom"] },
      presets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
      allow: arrayOf(string),
      deny: arrayOf(string),
      ruleCount: integer
    }),
    limits: objectSchema({
      fileArtifactMaxBytes: integer,
      commandTimeoutMs: integer,
      terminalAttachTicketTtlSeconds: integer
    }),
    lifecycle: objectSchema({
      ttlSeconds: integer,
      expiresAt: { type: ["string", "null"], format: "date-time" },
      createdAt: dateTime
    }),
    provider: objectSchema({
      kind: string,
      sandboxId: nullableString,
      capabilities: arrayOf(ref("RuntimeCapabilitySummary"))
    })
  }),
  SandboxSummary: objectSchema({
    capacityPhase: { type: ["string", "null"], enum: ["reserved", "active", "releasing", "uncertain", "released", null] },
    workspaceId: nullableString,
    id: string,
    opensandboxId: nullableString,
    name: string,
    template: string,
    status: { type: "string", enum: ["pending", "running", "idle", "pausing", "paused", "resuming", "error", "terminated"] },
    cpu: number,
    mem: number,
    started: string,
    owner: string,
    cost: number,
    ttlSeconds: integer,
    expiresAt: { type: ["string", "null"], format: "date-time" },
    publicUrl: nullableString,
    templateVersionId: nullableString,
    templateImageDigest: nullableString,
    egressPolicy: ref("EgressPolicyInput"),
    source: { oneOf: [ref("SandboxSourceProvenance"), { type: "null" }] },
    createdAt: dateTime,
    runtimeMetadata: ref("SandboxRuntimeMetadata")
  }, ["id", "name", "template", "status", "cpu", "mem", "started", "owner", "cost", "ttlSeconds", "expiresAt", "publicUrl", "createdAt", "runtimeMetadata"]),
  SandboxOperationSummary: objectSchema({
    id: string,
    sandboxId: nullableString,
    kind: { type: "string", enum: ["provision", "delete", "renew", "pause", "resume", "snapshot", "snapshot_delete", "route_expose"] },
    state: { type: "string", enum: ["queued", "running", "succeeded", "failed", "canceled"] },
    error: nullableString,
    attempts: integer,
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  CreateSandboxBody: objectSchema({
    template: string,
    snapshotId: string,
    workspaceId: { type: "string", pattern: "^wsp_[A-Za-z0-9_-]+$", description: "Exclusive organization workspace attachment. Cannot be combined with snapshotId." },
    name: string,
    ttlSeconds: integer,
    env: { type: "object", additionalProperties: { type: "string" } },
    egress: ref("EgressPolicyInput"),
    source: ref("SandboxSourceInput"),
    credentials: arrayOf(ref("AttachSandboxCredentialBody")),
    credentialMappings: arrayOf(ref("TemplateCredentialSlotMappingBody")),
    idempotencyKey: string,
    wait: boolean,
    waitTimeoutMs: integer
  }, []),
  CreateSandboxResponse: objectSchema({
    sandbox: ref("SandboxSummary"),
    credentialAttachments: arrayOf(ref("SandboxCredentialAttachmentSummary")),
    operation: ref("SandboxOperationSummary"),
    status: { type: "string", enum: ["created", "pending"] },
    message: string
  }, ["sandbox"]),
  SandboxesResponse: objectSchema({ sandboxes: arrayOf(ref("SandboxSummary")) }),
  SandboxResponse: objectSchema({ sandbox: ref("SandboxSummary") }),
  SandboxSourceResponse: objectSchema({ sandbox: ref("SandboxSummary") }),
  SandboxSnapshotSummary: objectSchema({
    id: string,
    sourceSandboxId: nullableString,
    name: nullableString,
    status: { type: "string", enum: ["creating", "ready", "failed", "deleting", "deleted", "expired"] },
    statusReason: nullableString,
    statusMessage: nullableString,
    template: nullableString,
    templateVersionId: nullableString,
    templateImageDigest: nullableString,
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    metadata: freeObject,
    providerState: freeObject,
    expiresAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime,
    deletedAt: { type: ["string", "null"], format: "date-time" }
  }),
  CreateSandboxSnapshotBody: objectSchema({
    name: string,
    metadata: { type: "object", additionalProperties: { type: "string" } },
    expiresAt: { type: ["string", "null"], format: "date-time" },
    idempotencyKey: string,
    wait: boolean,
    waitTimeoutMs: integer
  }, []),
  SandboxSnapshotResponse: objectSchema({
    snapshot: ref("SandboxSnapshotSummary"),
    operation: ref("SandboxOperationSummary"),
    status: { type: "string", enum: ["created", "pending"] },
    message: string
  }, ["snapshot"]),
  SandboxSnapshotsResponse: objectSchema({
    snapshots: arrayOf(ref("SandboxSnapshotSummary")),
    page: ref("PageSummary")
  }, ["snapshots"]),
  SandboxGitOperationMetadata: objectSchema({
    capability: { type: "string", enum: ["git"] },
    operation: {
      type: "string",
      enum: [
        "clone",
        "status",
        "branches",
        "checkout",
        "create-branch",
        "delete-branch",
        "add",
        "commit",
        "pull",
        "push",
        "remotes",
        "remote-add",
        "config-set",
        "config-get",
        "configure-user"
      ]
    },
    cwd: string,
    targetPath: string,
    repositoryUrl: string,
    branch: string,
    ref: string,
    remote: string,
    configKey: string,
    credentialPersistence: { type: "string", enum: ["one-shot", "dangerously-store-in-remote"] },
    hasCredentials: boolean
  }, ["capability", "operation"]),
  SandboxCommandMetadata: ref("SandboxGitOperationMetadata"),
  RunSandboxBody: objectSchema({
    command: string,
    stdin: string,
    cwd: string,
    env: { type: "object", additionalProperties: { type: "string" } },
    timeoutMs: integer,
    metadata: ref("SandboxCommandMetadata")
  }, []),
  RunResult: objectSchema({
    sandboxId: string,
    command: string,
    stdout: string,
    stderr: string,
    exitCode: integer,
    durationMs: number
  }),
  RunSandboxResponse: objectSchema({ result: ref("RunResult") }),
  SandboxCommandSessionSummary: objectSchema({
    id: string,
    sandboxId: string,
    provider: string,
    cwd: nullableString,
    status: { type: "string", enum: ["running", "closed"] }
  }),
  CreateSandboxCommandSessionBody: objectSchema({
    cwd: string
  }, []),
  SandboxCommandSessionResponse: objectSchema({ session: ref("SandboxCommandSessionSummary") }),
  RunSandboxCommandSessionBody: objectSchema({
    command: string,
    cwd: string,
    timeoutMs: integer
  }, ["command"]),
  RunSandboxCommandSessionResponse: objectSchema({ result: ref("RunResult") }),
  SandboxCommandSummary: objectSchema({
    id: string,
    sandboxId: string,
    provider: string,
    providerCommandId: nullableString,
    command: string,
    status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "killed"] },
    cwd: nullableString,
    envKeys: arrayOf(string),
    timeoutMs: { type: ["integer", "null"] },
    detached: boolean,
    stdout: string,
    stderr: string,
    exitCode: { type: ["integer", "null"] },
    finishReason: { type: ["string", "null"], enum: ["exit", "error", "killed", "timeout", "unknown", null] },
    signal: nullableString,
    error: nullableString,
    startedAt: { type: ["string", "null"], format: "date-time" },
    finishedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  CreateSandboxCommandBody: objectSchema({
    command: string,
    stdin: string,
    cwd: string,
    env: { type: "object", additionalProperties: { type: "string" } },
    timeoutMs: integer,
    detached: boolean,
    metadata: ref("SandboxCommandMetadata")
  }, ["command"]),
  SandboxCommandResponse: objectSchema({ command: ref("SandboxCommandSummary") }),
  SandboxCommandsResponse: objectSchema({ commands: arrayOf(ref("SandboxCommandSummary")) }),
  SandboxCommandLogsResponse: objectSchema({
    commandId: string,
    stdout: string,
    stderr: string,
    cursor: integer,
    tail: integer,
    stdoutTruncated: boolean,
    stderrTruncated: boolean
  }, ["commandId", "stdout", "stderr"]),
  SandboxLogEntry: objectSchema({
    ts: string,
    lvl: string,
    msg: string,
    source: string
  }, ["ts", "lvl", "msg"]),
  SandboxLogsResponse: objectSchema({ logs: arrayOf(ref("SandboxLogEntry")) }),
  SandboxFileEntry: objectSchema({
    path: string,
    name: string,
    type: string,
    size: integer,
    mode: string,
    owner: string,
    group: string,
    modifiedAt: { type: ["string", "null"], format: "date-time" }
  }, ["path", "name", "type", "size"]),
  SandboxFilesResponse: objectSchema({
    cwd: string,
    files: arrayOf(ref("SandboxFileEntry")),
    source: string,
    warnings: arrayOf(string)
  }),
  SandboxFileStatResponse: objectSchema({ file: ref("SandboxFileEntry") }),
  SandboxFileReadResponse: objectSchema({
    path: string,
    encoding: { type: "string", enum: ["utf8", "base64"] },
    content: string
  }, ["path", "encoding", "content"]),
  SandboxFileWriteBody: objectSchema({
    path: string,
    content: string,
    encoding: { type: "string", enum: ["utf8", "base64"] },
    createParents: boolean,
    mode: string
  }, ["path", "content"]),
  SandboxFileWriteResponse: objectSchema({ file: ref("SandboxFileEntry") }),
  SandboxFileUploadBody: objectSchema({
    path: string,
    contentBase64: string,
    sizeBytes: integer,
    sha256: string,
    createParents: boolean,
    mode: string
  }, ["path", "contentBase64"]),
  SandboxFileTransferMetadata: objectSchema({
    mode: { type: "string", enum: ["json-base64"] },
    encoding: { type: "string", enum: ["base64"] },
    maxBytes: integer
  }, ["mode", "encoding", "maxBytes"]),
  SandboxFileUploadResponse: objectSchema({
    file: ref("SandboxFileEntry"),
    sizeBytes: integer,
    sha256: string,
    transfer: ref("SandboxFileTransferMetadata")
  }, ["file", "sizeBytes", "sha256", "transfer"]),
  SandboxFileDownloadResponse: objectSchema({
    path: string,
    contentBase64: string,
    sizeBytes: integer,
    sha256: string,
    transfer: ref("SandboxFileTransferMetadata")
  }, ["path", "contentBase64", "sizeBytes", "sha256", "transfer"]),
  SandboxFileMkdirBody: objectSchema({
    path: string,
    recursive: boolean
  }, ["path"]),
  SandboxFileMkdirResponse: objectSchema({ file: ref("SandboxFileEntry") }),
  SandboxFileRenameBody: objectSchema({
    fromPath: string,
    toPath: string
  }, ["fromPath", "toPath"]),
  SandboxFileRenameResponse: objectSchema({ file: ref("SandboxFileEntry") }),
  SandboxFileRemoveResponse: objectSchema({
    ok: boolean,
    path: string
  }, ["ok", "path"]),
  SandboxMetricsResponse: objectSchema({
    current: objectSchema({
      cpu: number,
      mem: number,
      diskIo: number,
      networkOut: number,
      cpuCount: integer,
      memTotal: integer
    }, ["cpu", "mem", "diskIo", "networkOut"]),
    series: arrayOf(objectSchema({ ts: string, cpu: number, mem: number }))
  }),
  ExposeSandboxRouteBody: objectSchema({
    port: integer,
    protocol: { type: "string", enum: ["http", "https"] },
    accessMode: { type: "string", enum: ["public", "token"] },
    labels: arrayOf(string)
  }, ["port"]),
  SandboxRouteSummary: objectSchema({
    port: integer,
    protocol: { type: "string", enum: ["http", "https"] },
    accessMode: { type: "string", enum: ["public", "token"] },
    accessHeaderName: nullableString,
    tokenHint: nullableString,
    labels: arrayOf(string),
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    routeKey: string,
    host: string,
    url: string,
    targetUrl: string,
    state: { type: "string", enum: ["provisioning", "ready", "unhealthy", "terminated"] },
    provider: string,
    providerRouteId: nullableString,
    createdAt: dateTime,
    lastCheckedAt: { type: ["string", "null"], format: "date-time" },
    lastUsedAt: { type: ["string", "null"], format: "date-time" },
    terminatedAt: { type: ["string", "null"], format: "date-time" }
  }),
  SandboxRouteResponse: objectSchema({ route: ref("SandboxRouteSummary"), accessToken: string, accessHeaderName: string }, ["route"]),
  SandboxRoutesResponse: objectSchema({ routes: arrayOf(ref("SandboxRouteSummary")) }),
  CredentialVaultSubstitution: objectSchema({
    credential: string,
    placeholder: string,
    in: arrayOf({ type: "string", enum: ["path", "query", "header", "body"] })
  }, ["placeholder", "in"]),
  CredentialVaultMatch: objectSchema({
    schemes: arrayOf({ type: "string", enum: ["https", "http"] }),
    hosts: arrayOf(string),
    methods: arrayOf(string),
    paths: arrayOf(string)
  }, ["hosts"]),
  CredentialVaultBearerAuth: objectSchema({
    type: { type: "string", enum: ["bearer"] },
    credential: string,
    substitutions: arrayOf(ref("CredentialVaultSubstitution"))
  }, ["type"]),
  CredentialVaultBasicAuth: objectSchema({
    type: { type: "string", enum: ["basic"] },
    credential: string,
    substitutions: arrayOf(ref("CredentialVaultSubstitution"))
  }, ["type"]),
  CredentialVaultApiKeyAuth: objectSchema({
    type: { type: "string", enum: ["apiKey"] },
    name: string,
    credential: string,
    substitutions: arrayOf(ref("CredentialVaultSubstitution"))
  }, ["type", "name"]),
  CredentialVaultCustomHeader: objectSchema({
    name: string,
    credential: string
  }, ["name"]),
  CredentialVaultCustomHeadersAuth: objectSchema({
    type: { type: "string", enum: ["customHeaders"] },
    headers: arrayOf(ref("CredentialVaultCustomHeader")),
    substitutions: arrayOf(ref("CredentialVaultSubstitution"))
  }, ["type", "headers"]),
  CredentialVaultPassthroughAuth: objectSchema({
    type: { type: "string", enum: ["passthrough"] },
    substitutions: arrayOf(ref("CredentialVaultSubstitution"))
  }, ["type"]),
  CredentialVaultAuth: {
    oneOf: [
      ref("CredentialVaultBearerAuth"),
      ref("CredentialVaultBasicAuth"),
      ref("CredentialVaultApiKeyAuth"),
      ref("CredentialVaultCustomHeadersAuth"),
      ref("CredentialVaultPassthroughAuth")
    ],
    discriminator: { propertyName: "type" }
  },
  CredentialProviderPresetTest: objectSchema({
    target: string,
    method: string
  }, ["target"]),
  CredentialProviderPreset: objectSchema({
    id: credentialProviderPresetId,
    label: string,
    description: string,
    category: { type: "string", enum: ["model-api", "git-hosting", "package-registry"] },
    defaultEnvName: string,
    credentialName: string,
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: ref("CredentialVaultBinding"),
    egressDomains: arrayOf(string),
    test: ref("CredentialProviderPresetTest")
  }),
  CredentialProviderPresetsResponse: objectSchema({
    presets: arrayOf(ref("CredentialProviderPreset"))
  }),
  CredentialProviderPresetResponse: objectSchema({
    preset: ref("CredentialProviderPreset")
  }),
  CustomCredentialProfileInput: objectSchema({
    host: string,
    authType: { type: "string", enum: ["bearer", "apiKey"] },
    headerName: string,
    methods: arrayOf(string),
    paths: arrayOf(string),
    envName: string,
    testPath: string
  }, ["host", "authType"]),
  CustomCredentialProfile: objectSchema({
    host: string,
    authType: { type: "string", enum: ["bearer", "apiKey"] },
    headerName: nullableString,
    methods: arrayOf(string),
    paths: arrayOf(string),
    envName: string,
    testPath: string
  }),
  CredentialSecretUsageSummary: objectSchema({
    activeSandboxCount: integer,
    attachmentCount: integer,
    lastAttachedAt: { type: ["string", "null"], format: "date-time" }
  }),
  CredentialSourceCapabilities: objectSchema({
    reusable: boolean,
    rehydratable: boolean,
    rotatable: boolean,
    externallyOwned: boolean,
    shortLived: boolean,
    launchOnly: boolean
  }),
  CredentialSecretSummary: objectSchema({
    id: string,
    name: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: { anyOf: [ref("CustomCredentialProfile"), { type: "null" }] },
    sourceType: { type: "string", enum: ["harakiri_encrypted"] },
    status: { type: "string", enum: ["active", "disabled", "deleted"] },
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    version: integer,
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: ref("CredentialVaultBinding"),
    egressDomains: arrayOf(string),
    hasEncryptedSecret: boolean,
    metadata: freeObject,
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    rotatedAt: { type: ["string", "null"], format: "date-time" },
    disabledAt: { type: ["string", "null"], format: "date-time" },
    deletedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime,
    usage: ref("CredentialSecretUsageSummary"),
    capabilities: ref("CredentialSourceCapabilities")
  }),
  CreateCredentialSecretBody: objectSchema({
    name: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: ref("CustomCredentialProfileInput"),
    value: { ...string, writeOnly: true },
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    metadata: freeObject
  }, ["name", "providerPresetId", "value"]),
  RotateCredentialSecretBody: objectSchema({
    value: { ...string, writeOnly: true }
  }),
  UpdateCredentialSecretBody: objectSchema({
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] }
  }),
  CredentialSecretsResponse: objectSchema({
    secrets: arrayOf(ref("CredentialSecretSummary"))
  }),
  CredentialSecretResponse: objectSchema({
    secret: ref("CredentialSecretSummary")
  }),
  KubernetesSecretReference: objectSchema({
    namespace: string,
    name: string,
    key: string
  }),
  KubernetesSecretReferenceInput: objectSchema({
    namespace: string,
    name: string,
    key: string
  }, ["name", "key"]),
  ExternalSecretValidationSummary: objectSchema({
    state: {
      type: "string",
      enum: ["unvalidated", "valid", "not_found", "forbidden", "invalid", "unavailable"]
    },
    message: nullableString,
    versionRef: nullableString,
    checkedAt: { type: ["string", "null"], format: "date-time" }
  }),
  ExternalSecretReferenceSummary: objectSchema({
    id: string,
    name: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: { anyOf: [ref("CustomCredentialProfile"), { type: "null" }] },
    sourceType: { type: "string", enum: ["external_ref"] },
    resolverType: { type: "string", enum: ["kubernetes_secret"] },
    reference: ref("KubernetesSecretReference"),
    status: { type: "string", enum: ["active", "disabled", "deleted"] },
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    version: integer,
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: ref("CredentialVaultBinding"),
    egressDomains: arrayOf(string),
    metadata: freeObject,
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    disabledAt: { type: ["string", "null"], format: "date-time" },
    deletedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime,
    validation: ref("ExternalSecretValidationSummary"),
    usage: ref("CredentialSecretUsageSummary"),
    capabilities: ref("CredentialSourceCapabilities")
  }),
  CreateExternalSecretReferenceBody: objectSchema({
    name: string,
    providerPresetId: credentialProviderProfileId,
    customProfile: ref("CustomCredentialProfileInput"),
    resolverType: { type: "string", enum: ["kubernetes_secret"] },
    reference: ref("KubernetesSecretReferenceInput"),
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    metadata: freeObject
  }, ["name", "providerPresetId", "resolverType", "reference"]),
  UpdateExternalSecretReferenceBody: {
    ...objectSchema({
      name: string,
      providerPresetId: credentialProviderProfileId,
      customProfile: ref("CustomCredentialProfileInput"),
      reference: ref("KubernetesSecretReferenceInput"),
      usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
      fakeEnv: { type: "object", additionalProperties: { type: "string" } },
      metadata: freeObject
    }, []),
    minProperties: 1
  },
  ExternalSecretReferencesResponse: objectSchema({
    references: arrayOf(ref("ExternalSecretReferenceSummary"))
  }),
  ExternalSecretReferenceResponse: objectSchema({
    reference: ref("ExternalSecretReferenceSummary")
  }),
  GitHubAppInstallationScope: objectSchema({
    installationId: string,
    repositories: arrayOf(string),
    permissions: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "string", enum: ["read", "write", "admin"] }
    }
  }),
  DynamicCredentialValidationSummary: objectSchema({
    state: {
      type: "string",
      enum: ["unvalidated", "valid", "not_found", "forbidden", "invalid", "unavailable"]
    },
    message: nullableString,
    checkedAt: { type: ["string", "null"], format: "date-time" }
  }),
  DynamicCredentialIssuerSummary: objectSchema({
    id: string,
    name: string,
    providerPresetId: { type: "string", enum: ["github"] },
    sourceType: { type: "string", enum: ["dynamic"] },
    issuerType: { type: "string", enum: ["github_app_installation"] },
    scope: ref("GitHubAppInstallationScope"),
    status: { type: "string", enum: ["active", "disabled", "deleted"] },
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    version: integer,
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: ref("CredentialVaultBinding"),
    egressDomains: arrayOf(string),
    metadata: freeObject,
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    disabledAt: { type: ["string", "null"], format: "date-time" },
    deletedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime,
    lastIssuedAt: { type: ["string", "null"], format: "date-time" },
    validation: ref("DynamicCredentialValidationSummary"),
    usage: ref("CredentialSecretUsageSummary"),
    capabilities: ref("CredentialSourceCapabilities")
  }),
  CreateDynamicCredentialIssuerBody: objectSchema({
    name: string,
    issuerType: { type: "string", enum: ["github_app_installation"] },
    scope: ref("GitHubAppInstallationScope"),
    usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    metadata: freeObject
  }, ["name", "issuerType", "scope"]),
  UpdateDynamicCredentialIssuerBody: {
    ...objectSchema({
      name: string,
      scope: ref("GitHubAppInstallationScope"),
      usePolicy: { type: "string", enum: ["admins_only", "organization_members"] },
      fakeEnv: { type: "object", additionalProperties: { type: "string" } },
      metadata: freeObject
    }, []),
    minProperties: 1
  },
  DynamicCredentialIssuersResponse: objectSchema({
    issuers: arrayOf(ref("DynamicCredentialIssuerSummary"))
  }),
  DynamicCredentialIssuerResponse: objectSchema({
    issuer: ref("DynamicCredentialIssuerSummary")
  }),
  CredentialVaultBinding: objectSchema({
    name: string,
    match: ref("CredentialVaultMatch"),
    auth: ref("CredentialVaultAuth")
  }),
  InlineEphemeralSandboxCredentialBody: objectSchema({
    sourceType: { type: "string", enum: ["inline_ephemeral"] },
    displayName: string,
    credentialName: string,
    value: { ...string, writeOnly: true },
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    binding: objectSchema({
      name: string,
      match: ref("CredentialVaultMatch"),
      auth: ref("CredentialVaultAuth")
    }, ["match", "auth"])
  }, ["value", "binding"]),
  HarakiriEncryptedSandboxCredentialBody: objectSchema({
    sourceType: { type: "string", enum: ["harakiri_encrypted"] },
    secretId: string,
    displayName: string,
    credentialName: string,
    bindingName: string
  }, ["sourceType", "secretId"]),
  ExternalReferenceSandboxCredentialBody: objectSchema({
    sourceType: { type: "string", enum: ["external_ref"] },
    referenceId: string,
    displayName: string,
    credentialName: string,
    bindingName: string
  }, ["sourceType", "referenceId"]),
  DynamicSandboxCredentialBody: objectSchema({
    sourceType: { type: "string", enum: ["dynamic"] },
    issuerId: string,
    displayName: string,
    credentialName: string,
    bindingName: string
  }, ["sourceType", "issuerId"]),
  AttachSandboxCredentialBody: {
    oneOf: [
      ref("InlineEphemeralSandboxCredentialBody"),
      ref("HarakiriEncryptedSandboxCredentialBody"),
      ref("ExternalReferenceSandboxCredentialBody"),
      ref("DynamicSandboxCredentialBody")
    ]
  },
  InlineEphemeralTemplateCredentialSourceBody: objectSchema({
    sourceType: { type: "string", enum: ["inline_ephemeral"] },
    displayName: string,
    credentialName: string,
    bindingName: string,
    value: { ...string, writeOnly: true },
    fakeEnv: { type: "object", additionalProperties: { type: "string" } }
  }, ["value"]),
  TemplateCredentialSlotSourceBody: {
    oneOf: [
      ref("InlineEphemeralTemplateCredentialSourceBody"),
      ref("HarakiriEncryptedSandboxCredentialBody"),
      ref("ExternalReferenceSandboxCredentialBody"),
      ref("DynamicSandboxCredentialBody")
    ]
  },
  TemplateCredentialSlotMappingBody: objectSchema({
    slotId: string,
    providerPresetId: credentialProviderProfileId,
    source: ref("TemplateCredentialSlotSourceBody")
  }, ["source"]),
  CredentialVaultProviderState: objectSchema({
    revision: integer,
    credentials: arrayOf(objectSchema({
      name: string,
      sourceType: string,
      revision: integer
    })),
    bindings: arrayOf(objectSchema({
      name: string,
      revision: integer,
      match: ref("CredentialVaultMatch"),
      auth: objectSchema({
        type: string,
        name: string
      }, ["type"])
    }, ["name", "revision"]))
  }),
  SandboxCredentialAttachmentSummary: objectSchema({
    id: string,
    sandboxId: string,
    displayName: string,
    sourceType: { type: "string", enum: ["inline_ephemeral", "harakiri_encrypted", "external_ref", "dynamic"] },
    sourceRef: nullableString,
    credentialName: string,
    bindingName: string,
    match: ref("CredentialVaultMatch"),
    auth: ref("CredentialVaultAuth"),
    fakeEnv: { type: "object", additionalProperties: { type: "string" } },
    status: { type: "string", enum: ["pending", "injected", "requires_reinjection", "detached", "failed"] },
    provider: string,
    providerRevision: { type: ["integer", "null"] },
    providerState: { type: "string", enum: ["unknown", "present", "missing", "unavailable"] },
    providerCheckedAt: { type: ["string", "null"], format: "date-time" },
    providerMetadata: freeObject,
    sourceMetadata: freeObject,
    expiresAt: { type: ["string", "null"], format: "date-time" },
    refreshState: { type: "string", enum: ["not_applicable", "current", "expiring", "expired", "refresh_failed"] },
    refreshAttemptedAt: { type: ["string", "null"], format: "date-time" },
    refreshedAt: { type: ["string", "null"], format: "date-time" },
    lastError: nullableString,
    injectedAt: { type: ["string", "null"], format: "date-time" },
    detachedAt: { type: ["string", "null"], format: "date-time" },
    createdByUserId: nullableString,
    createdByLabel: nullableString,
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  SandboxCredentialsResponse: objectSchema({
    attachments: arrayOf(ref("SandboxCredentialAttachmentSummary"))
  }),
  InspectSandboxCredentialsResponse: objectSchema({
    attachments: arrayOf(ref("SandboxCredentialAttachmentSummary")),
    vault: { oneOf: [ref("CredentialVaultProviderState"), { type: "null" }] }
  }, ["attachments", "vault"]),
  AttachSandboxCredentialResponse: objectSchema({
    attachment: ref("SandboxCredentialAttachmentSummary"),
    vault: ref("CredentialVaultProviderState")
  }),
  RefreshSandboxCredentialResponse: objectSchema({
    attachment: ref("SandboxCredentialAttachmentSummary"),
    vault: ref("CredentialVaultProviderState")
  }),
  DetachSandboxCredentialResponse: objectSchema({
    attachment: ref("SandboxCredentialAttachmentSummary"),
    vault: { oneOf: [ref("CredentialVaultProviderState"), { type: "null" }] }
  }),
  RehydrateSandboxCredentialsResponse: objectSchema({
    attachments: arrayOf(ref("SandboxCredentialAttachmentSummary")),
    vault: { oneOf: [ref("CredentialVaultProviderState"), { type: "null" }] },
    rehydrated: integer,
    skipped: integer,
    failed: integer
  }, ["attachments", "vault", "rehydrated", "skipped", "failed"]),
  TestSandboxCredentialBody: objectSchema({
    target: string,
    method: string,
    timeoutMs: integer
  }, []),
  TestSandboxCredentialResponse: objectSchema({
    attachmentId: string,
    target: string,
    normalizedTarget: string,
    url: string,
    method: string,
    ok: boolean,
    status: { type: "string", enum: ["reachable", "blocked_or_unreachable", "binding_mismatch", "not_injected", "sandbox_not_running", "provider_unavailable"] },
    httpStatus: { type: ["integer", "null"] },
    stdout: string,
    stderr: string,
    durationMs: number,
    checkedAt: dateTime
  }),
  RuntimeCapabilitySummary: objectSchema({
    name: {
      type: "string",
      enum: [
        "lifecycle",
        "lifecycleRenew",
        "lifecycleKill",
        "lifecycleReconnect",
        "lifecyclePause",
        "lifecycleResume",
        "lifecycleSnapshot",
        "snapshotList",
        "snapshotDelete",
        "createFromSnapshot",
        "commandRun",
        "commands",
        "detachedCommands",
        "commandLogs",
        "commandLogTail",
        "commandKill",
        "terminalAttach",
        "terminalResize",
        "shellSessions",
        "sessionCommands",
        "filesystemList",
        "filesystemRead",
        "filesystemWrite",
        "routes",
        "tokenRoutes",
        "git",
        "egressPolicy",
        "credentialVault",
        "credentialVaultPatch",
        "credentialVaultSanitizedRead",
        "logs",
        "metrics"
      ]
    },
    state: { type: "string", enum: ["available", "degraded", "unavailable"] },
    contract: {
      type: "string",
      enum: [
        "opensandbox_spec",
        "opensandbox_provider",
        "harakiri_control_plane",
        "unavailable",
        "unsupported"
      ],
      description: "Where the capability is implemented: formal OpenSandbox API/spec, current OpenSandbox provider behavior, Harakiri control-plane overlay, unavailable in this provider, or unsupported."
    },
    source: {
      ...string,
      description: "Human-readable provider or control-plane source for this capability."
    },
    required: boolean,
    reason: nullableString
  }),
  RuntimeCapabilitiesResponse: objectSchema({
    provider: string,
    capabilities: arrayOf(ref("RuntimeCapabilitySummary")),
    generatedAt: dateTime
  }),
  SandboxTerminalAttachTicketResponse: objectSchema({
    ticket: string,
    expiresAt: dateTime,
    attachUrl: string
  }),
  EgressNetworkRule: objectSchema({
    action: { type: "string", enum: ["allow", "deny"] },
    target: string
  }),
  EgressNetworkPolicy: objectSchema({
    defaultAction: { type: "string", enum: ["allow", "deny"] },
    egress: arrayOf(ref("EgressNetworkRule"))
  }),
  EgressPolicyInput: objectSchema({
    mode: { type: "string", enum: ["open", "restricted", "blocked", "custom"] },
    presets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
    allow: arrayOf(string),
    deny: arrayOf(string),
    defaultAction: { type: "string", enum: ["allow", "deny"] }
  }, []),
  EgressPolicyRule: objectSchema({
    action: { type: "string", enum: ["allow", "deny"] },
    target: string,
    source: { type: "string", enum: ["preset", "template", "sandbox", "custom"] },
    presetId: { type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }
  }, ["action", "target", "source"]),
  EgressProviderStatus: objectSchema({
    available: boolean,
    status: string,
    mode: string,
    enforcementMode: string,
    reason: string,
    error: string,
    checkedAt: dateTime
  }, ["available"]),
  EgressPolicySummary: objectSchema({
    mode: { type: "string", enum: ["open", "restricted", "blocked", "custom"] },
    presets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
    allow: arrayOf(string),
    deny: arrayOf(string),
    rules: arrayOf(ref("EgressPolicyRule")),
    compiledPolicy: { anyOf: [ref("EgressNetworkPolicy"), { type: "null" }] },
    providerStatus: ref("EgressProviderStatus"),
    updatedAt: { type: ["string", "null"], format: "date-time" }
  }, ["mode", "presets", "allow", "deny", "rules", "compiledPolicy"]),
  SandboxEgressResponse: objectSchema({ egress: ref("EgressPolicySummary") }),
  PatchSandboxEgressBody: objectSchema({
    mode: { type: "string", enum: ["open", "restricted", "blocked", "custom"] },
    presets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
    allow: arrayOf(string),
    deny: arrayOf(string),
    reset: boolean
  }, []),
  TestSandboxEgressBody: objectSchema({ target: string }),
  TestSandboxEgressResponse: objectSchema({
    target: string,
    normalizedTarget: string,
    url: string,
    ok: boolean,
    status: { type: "string", enum: ["reachable", "blocked_or_unreachable", "sandbox_not_running", "provider_unavailable"] },
    stdout: string,
    stderr: string,
    durationMs: number
  }),
  ApiKeySummary: objectSchema({
    id: string,
    name: string,
    prefix: string,
    lastFour: string,
    createdAt: dateTime,
    lastUsedAt: { type: ["string", "null"], format: "date-time" },
    revokedAt: { type: ["string", "null"], format: "date-time" },
    scopes: arrayOf(ref("ApiKeyScope")),
    expiresAt: { type: ["string", "null"], format: "date-time" },
    createdByUserId: nullableString,
    legacy: boolean
  }),
  ApiKeyScope: { type: "string", enum: apiKeyScopes },
  ApiKeysResponse: objectSchema({ keys: arrayOf(ref("ApiKeySummary")), allowedScopes: arrayOf(ref("ApiKeyScope")), canManageAll: boolean }, ["keys"]),
  CreateApiKeyBody: objectSchema({
    name: { type: "string", minLength: 1, maxLength: 100 },
    scopes: { type: "array", items: ref("ApiKeyScope"), minItems: 1, maxItems: apiKeyScopes.length, description: "Omitted: runtime profile. Sensitive scopes require a human admin; keys cannot manage keys." },
    expiresAt: { ...dateTime, description: "Future expiry within 365 days; defaults to 90 days. New keys cannot be non-expiring." }
  }, ["name"]),
  CreateApiKeyResponse: objectSchema({
    key: ref("ApiKeySummary"),
    token: string
  }),
  RegistryCredentialSummary: objectSchema({
    id: string,
    name: string,
    registryHost: string,
    username: nullableString,
    secretRef: nullableString,
    purpose: { type: "string", enum: ["pull", "push", "push_pull"] },
    repositoryPrefix: string,
    pullSecretRef: nullableString,
    pushSecretRef: nullableString,
    hasEncryptedSecret: boolean,
    metadata: freeObject,
    lastUsedAt: { type: ["string", "null"], format: "date-time" },
    revokedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  RegistryCredentialsResponse: objectSchema({ credentials: arrayOf(ref("RegistryCredentialSummary")) }),
  RegistryCredentialResponse: objectSchema({ credential: ref("RegistryCredentialSummary") }),
  UpsertRegistryCredentialBody: objectSchema({
    name: string,
    registryHost: string,
    username: string,
    secretRef: string,
    secret: string,
    purpose: { type: "string", enum: ["pull", "push", "push_pull"] },
    repositoryPrefix: string,
    pullSecretRef: string,
    pushSecretRef: string,
    metadata: freeObject
  }, ["name", "registryHost"]),
  UsageSummary: objectSchema({
    sandboxesSpawned: integer,
    computeHours: { ...number, deprecated: true, description: "Unmeasured; zero is a numeric compatibility placeholder, not observed usage. Consult coverage." },
    avgColdStartMs: { ...number, deprecated: true, description: "Unmeasured; template boot estimates are not observed cold starts. Consult coverage." },
    avgRuntimeSeconds: { ...number, deprecated: true, description: "Unmeasured; zero is a numeric compatibility placeholder. Consult coverage." },
    concurrentNow: integer,
    capacity: ref("OrganizationCapacity"),
    concurrentPeak: { ...integer, deprecated: true, description: "Unmeasured; zero is a compatibility placeholder, not an observed peak." },
    series: arrayOf(number),
    topTemplates: arrayOf(objectSchema({ label: string, value: number })),
    statusBreakdown: arrayOf(objectSchema({ label: string, value: number })),
    coverage: objectSchema({
      source: { type: "string", enum: ["control_plane_records"] },
      period: { type: "string", enum: ["retained_records"] },
      observedAt: { type: "string", format: "date-time" },
      unavailableMetrics: arrayOf({ type: "string", enum: ["computeHours", "avgColdStartMs", "avgRuntimeSeconds", "concurrentPeak", "series"] }),
      concurrencyLimitEnforced: boolean
    })
  }, ["sandboxesSpawned", "computeHours", "avgColdStartMs", "avgRuntimeSeconds", "concurrentNow", "concurrentPeak", "series", "topTemplates", "statusBreakdown"]),
  OrganizationSettings: objectSchema({
    id: string,
    name: string,
    slug: string,
    idleTtlSeconds: integer,
    maxConcurrency: { ...integer, minimum: 1, maximum: 10000, description: "Maximum execution reservations; lowering the limit never evicts existing work." },
    capacityRevision: { ...integer, minimum: 1 },
    defaultTemplateId: nullableString,
    defaultEgressPolicy: ref("EgressPolicyInput"),
    egressAllowedPresets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
    egressCustomDomainsEnabled: boolean,
    egressMaxRules: integer,
    egressRedactDomains: boolean
  }, ["name", "slug", "idleTtlSeconds", "maxConcurrency", "defaultTemplateId", "defaultEgressPolicy", "egressAllowedPresets", "egressCustomDomainsEnabled", "egressMaxRules", "egressRedactDomains"]),
  OrganizationSettingsResponse: objectSchema({ organization: ref("OrganizationSettings") }),
  UpdateOrganizationSettingsBody: objectSchema({
    name: string, slug: string, idleTtlSeconds: integer,
    maxConcurrency: { ...integer, minimum: 1, maximum: 10000 },
    expectedCapacityRevision: { ...integer, minimum: 1, description: "Required when maxConcurrency is supplied. A stale revision returns 409 organization_capacity_settings_conflict." },
    defaultTemplateId: nullableString, defaultEgressPolicy: ref("EgressPolicyInput"),
    egressAllowedPresets: arrayOf(string), egressCustomDomainsEnabled: boolean,
    egressMaxRules: integer, egressRedactDomains: boolean
  }, []),
  OrganizationCapacity: objectSchema({
    state: { type: "string", enum: ["enforced", "reconciling", "quarantined"] },
    limit: integer, revision: integer,
    inUse: { type: ["integer", "null"] }, available: { type: ["integer", "null"] }, overLimit: { type: ["integer", "null"] },
    breakdown: { anyOf: [objectSchema({ reserved: integer, active: integer, releasing: integer, uncertain: integer }), { type: "null" }] },
    observedAt: { type: "string", format: "date-time" }
  }),
  OrganizationCapacityResponse: objectSchema({ capacity: ref("OrganizationCapacity") }),
  AccountCapabilities: objectSchema({
    canManageMembers: boolean,
    canManageCredentialSecrets: boolean,
    canManageSettings: boolean,
    canManageAllApiKeys: boolean
  }, ["canManageMembers", "canManageCredentialSecrets"]),
  OrganizationMemberSummary: objectSchema({
    id: string,
    kind: { type: "string", enum: ["member", "invitation"] },
    userId: nullableString,
    membershipId: nullableString,
    invitationId: nullableString,
    email: string,
    fullName: nullableString,
    role: string,
    status: { type: "string", enum: ["active", "sent", "send_failed", "pending", "expired", "accepted", "canceled"] },
    keycloakLinked: boolean,
    joinedAt: { type: ["string", "null"], format: "date-time" },
    invitedAt: { type: ["string", "null"], format: "date-time" },
    expiresAt: { type: ["string", "null"], format: "date-time" },
    lastError: nullableString,
    actions: objectSchema({
      canResend: boolean,
      canCancel: boolean,
      canRemove: boolean
    })
  }),
  OrganizationMembersResponse: objectSchema({ members: arrayOf(ref("OrganizationMemberSummary")) }),
  AddOrganizationMemberBody: objectSchema({ email: string }, ["email"]),
  AddOrganizationMemberResponse: objectSchema({
    member: ref("OrganizationMemberSummary"),
    created: boolean
  }),
  OrganizationInvitationResponse: objectSchema({
    member: ref("OrganizationMemberSummary"),
    created: boolean
  }),
  OrganizationMemberMutationResponse: objectSchema({
    member: ref("OrganizationMemberSummary")
  }),
  CurrentAccountResponse: objectSchema({
    user: objectSchema({
      id: string,
      email: string,
      fullName: nullableString,
      onboardingCompletedAt: { type: ["string", "null"], format: "date-time" }
    }),
    auth: freeObject,
    role: string,
    capabilities: ref("AccountCapabilities"),
    organization: ref("OrganizationSettings")
  }),
  CompleteOnboardingResponse: objectSchema({
    user: objectSchema({
      id: string,
      email: string,
      fullName: nullableString,
      onboardingCompletedAt: dateTime
    })
  })
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Harakiri Sandbox API",
    version: "0.5.0-rc.3",
    description: "Control-plane API for sandbox lifecycle, templates, Credential Vault, routes, registry credentials, and account settings."
  },
  servers: [
    {
      url: "http://127.0.0.1:18082",
      description: "Local development port-forward"
    }
  ],
  tags: [
    { name: "System" },
    { name: "Account" },
    { name: "Templates" },
    { name: "Template Builds" },
    { name: "Sandboxes" },
    { name: "Sandbox Runtime" },
    { name: "Routes" },
    { name: "Credential Vault" },
    { name: "API Keys" },
    { name: "Registry Credentials" },
    { name: "Usage" },
    { name: "Members" },
    { name: "Organization Settings" }
  ],
  paths: {
    "/health": {
      get: { tags: ["System"], summary: "Health check", operationId: "getHealth", security: [], responses: ok("Health status", ref("HealthResponse")) }
    },
    "/v1/bootstrap": {
      get: { tags: ["System"], summary: "Read public web bootstrap config", operationId: "getBootstrap", security: [], responses: ok("Bootstrap config", ref("BootstrapResponse")) }
    },
    "/openapi.json": {
      get: { tags: ["System"], summary: "Read the OpenAPI contract", operationId: "getOpenApi", security: [], responses: ok("OpenAPI document", freeObject) }
    },
    "/v1/me": {
      get: secured({ tags: ["Account"], summary: "Read current account", operationId: "getCurrentAccount", responses: { ...ok("Current account", ref("CurrentAccountResponse")), ...authErrorResponses } })
    },
    "/v1/me/onboarding/complete": {
      post: secured({ tags: ["Account"], summary: "Mark onboarding complete", operationId: "completeOnboarding", responses: { ...ok("Updated user", ref("CompleteOnboardingResponse")), ...authErrorResponses } })
    },
    "/v1/templates": {
      get: secured({
        tags: ["Templates"],
        summary: "List templates",
        operationId: "listTemplates",
        parameters: [
          parameter("q", "query", string, false),
          parameter("visibility", "query", string, false),
          parameter("owner", "query", string, false),
          parameter("runtimeFamily", "query", string, false),
          parameter("status", "query", string, false),
          parameter("limit", "query", integer, false),
          parameter("offset", "query", integer, false)
        ],
        responses: { ...ok("Templates", ref("TemplatesResponse")), ...authErrorResponses }
      }),
      post: secured({
        tags: ["Templates"],
        summary: "Create a template definition",
        operationId: "createTemplate",
        requestBody: jsonBody(ref("CreateTemplateBody")),
        responses: { ...created("Created template", ref("TemplateResponse")), ...authErrorResponses }
      })
    },
    "/v1/templates/{id}": {
      get: secured({ tags: ["Templates"], summary: "Get a template", operationId: "getTemplate", parameters: [templateIdPath], responses: { ...ok("Template", ref("TemplateResponse")), ...authErrorResponses } })
    },
    "/v1/templates/{id}/versions": {
      get: secured({ tags: ["Templates"], summary: "List template versions", operationId: "listTemplateVersions", parameters: [templateIdPath], responses: { ...ok("Template versions", ref("TemplateVersionsResponse")), ...authErrorResponses } })
    },
    "/v1/templates/{id}/egress": {
      patch: secured({ tags: ["Templates"], summary: "Update template outbound access default", operationId: "updateTemplateEgress", parameters: [templateIdPath], requestBody: jsonBody(ref("UpdateTemplateEgressBody")), responses: { ...ok("Updated template", ref("TemplateResponse")), ...authErrorResponses } })
    },
    "/v1/templates/{id}/promote": {
      post: secured({ tags: ["Templates"], summary: "Promote a template version", operationId: "promoteTemplateVersion", parameters: [templateIdPath], requestBody: jsonBody(ref("PromoteTemplateBody")), responses: { ...ok("Promoted template", ref("TemplateResponse")), ...authErrorResponses } })
    },
    "/v1/templates/{id}/archive": {
      post: secured({ tags: ["Templates"], summary: "Archive a custom template", operationId: "archiveTemplate", parameters: [templateIdPath], responses: { ...ok("Archived template", ref("TemplateResponse")), ...authErrorResponses } })
    },
    "/v1/templates/{id}/builds": {
      post: secured({ tags: ["Template Builds"], summary: "Create a template build", operationId: "createTemplateBuild", parameters: [templateIdPath], requestBody: jsonBody(ref("CreateTemplateBuildBody")), responses: { ...created("Created template build", ref("TemplateBuildResponse")), ...authErrorResponses } })
    },
    "/v1/template-builds": {
      get: secured({
        tags: ["Template Builds"],
        summary: "List template builds",
        operationId: "listTemplateBuilds",
        parameters: [
          parameter("status", "query", string, false),
          parameter("q", "query", string, false),
          parameter("template", "query", string, false),
          parameter("limit", "query", integer, false)
        ],
        responses: { ...ok("Template builds", ref("TemplateBuildsResponse")), ...authErrorResponses }
      })
    },
    "/v1/template-builds/{id}": {
      get: secured({ tags: ["Template Builds"], summary: "Get a template build", operationId: "getTemplateBuild", parameters: [buildIdPath], responses: { ...ok("Template build", ref("TemplateBuildResponse")), ...authErrorResponses } })
    },
    "/v1/template-builds/{id}/logs": {
      get: secured({ tags: ["Template Builds"], summary: "Read template build logs", operationId: "getTemplateBuildLogs", parameters: [buildIdPath], responses: { ...ok("Template build logs", ref("TemplateBuildLogsResponse")), ...authErrorResponses } })
    },
    "/v1/template-builds/{id}/context": {
      post: secured({ tags: ["Template Builds"], summary: "Upload template build context", operationId: "uploadTemplateBuildContext", parameters: [buildIdPath], requestBody: jsonBody(ref("UploadTemplateBuildContextBody")), responses: { ...ok("Uploaded context", ref("TemplateBuildContextResponse")), ...authErrorResponses } })
    },
    "/v1/template-builds/{id}/cancel": {
      post: secured({ tags: ["Template Builds"], summary: "Cancel a template build", operationId: "cancelTemplateBuild", parameters: [buildIdPath], responses: { ...ok("Canceled build", ref("TemplateBuildResponse")), ...authErrorResponses } })
    },
    "/v1/template-builds/{id}/retry": {
      post: secured({ tags: ["Template Builds"], summary: "Retry a template build", operationId: "retryTemplateBuild", parameters: [buildIdPath], responses: { ...ok("Retried build", ref("TemplateBuildResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes": {
      get: secured({
        tags: ["Sandboxes"],
        summary: "List sandboxes",
        operationId: "listSandboxes",
        parameters: [
          parameter("status", "query", string, false),
          parameter("q", "query", string, false),
          parameter("template", "query", string, false),
          parameter("templateVersionId", "query", string, false),
          parameter("limit", "query", integer, false)
        ],
        responses: { ...ok("Sandboxes", ref("SandboxesResponse")), ...authErrorResponses }
      }),
      post: secured({
        tags: ["Sandboxes"],
        summary: "Create a sandbox",
        operationId: "createSandbox",
        parameters: [parameter("Prefer", "header", string, false), parameter("Idempotency-Key", "header", string, false)],
        requestBody: jsonBody(ref("CreateSandboxBody")),
        description: "Atomically reserves an organization execution slot before credential issuance or runtime creation. Reuse Idempotency-Key for the same intent after a lost response. wait:false means admitted provisioning, not an overflow queue.",
        responses: { ...created("Created sandbox", ref("CreateSandboxResponse")), ...accepted("Queued sandbox", ref("CreateSandboxResponse")), ...authErrorResponses, ...capacityErrorResponses }
      })
    },
    "/v1/sandboxes/{id}": {
      get: secured({ tags: ["Sandboxes"], summary: "Get a sandbox", operationId: "getSandbox", parameters: [pathId], responses: { ...ok("Sandbox", ref("SandboxResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Sandboxes"], summary: "Request sandbox deletion", description: "Acceptance does not prove runtime absence. Poll the sandbox and organization capacity until cleanup is confirmed.", operationId: "deleteSandbox", parameters: [pathId], responses: { ...noContent("Deletion accepted"), ...authErrorResponses, ...capacityErrorResponses } })
    },
    "/v1/sandboxes/{id}/source": {
      patch: secured({ tags: ["Sandboxes"], summary: "Update sandbox source provenance", operationId: "updateSandboxSource", parameters: [pathId], requestBody: jsonBody(ref("PatchSandboxSourceBody")), responses: { ...ok("Sandbox source", ref("SandboxSourceResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/pause": {
      post: secured({ tags: ["Sandboxes"], summary: "Pause a running sandbox", operationId: "pauseSandbox", parameters: [pathId, parameter("Idempotency-Key", "header", string, false)], responses: { ...ok("Paused sandbox", ref("SandboxResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/resume": {
      post: secured({ tags: ["Sandboxes"], summary: "Resume a paused sandbox", description: "Reserves capacity before resuming a released pause. The returned sandbox can still be resuming; poll until running. A full organization returns 409 without resuming.", operationId: "resumeSandbox", parameters: [pathId, parameter("Idempotency-Key", "header", string, false)], responses: { ...ok("Resume accepted", ref("SandboxResponse")), ...authErrorResponses, ...capacityErrorResponses } })
    },
    "/v1/sandboxes/{id}/renew": {
      post: secured({ tags: ["Sandboxes"], summary: "Renew an active sandbox TTL after provider confirmation", operationId: "renewSandbox", parameters: [pathId, parameter("Idempotency-Key", "header", string, false)], responses: { ...ok("Renewed sandbox", ref("OkResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/snapshots": {
      post: secured({ tags: ["Sandboxes"], summary: "Create a sandbox snapshot", operationId: "createSandboxSnapshot", parameters: [pathId, parameter("Idempotency-Key", "header", string, false)], requestBody: jsonBody(ref("CreateSandboxSnapshotBody")), responses: { ...created("Created snapshot", ref("SandboxSnapshotResponse")), ...accepted("Queued snapshot", ref("SandboxSnapshotResponse")), ...authErrorResponses } })
    },
    "/v1/snapshots": {
      get: secured({
        tags: ["Sandboxes"],
        summary: "List sandbox snapshots",
        operationId: "listSandboxSnapshots",
        parameters: [
          parameter("status", "query", string, false),
          parameter("sandboxId", "query", string, false),
          parameter("includeDeleted", "query", boolean, false),
          parameter("limit", "query", integer, false),
          parameter("offset", "query", integer, false)
        ],
        responses: { ...ok("Sandbox snapshots", ref("SandboxSnapshotsResponse")), ...authErrorResponses }
      })
    },
    "/v1/snapshots/{snapshotId}": {
      get: secured({ tags: ["Sandboxes"], summary: "Get a sandbox snapshot", operationId: "getSandboxSnapshot", parameters: [snapshotIdPath], responses: { ...ok("Sandbox snapshot", ref("SandboxSnapshotResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Sandboxes"], summary: "Delete a sandbox snapshot", operationId: "deleteSandboxSnapshot", parameters: [snapshotIdPath, parameter("Idempotency-Key", "header", string, false)], responses: { ...ok("Deleted snapshot", ref("OkResponse")), ...authErrorResponses } })
    },
    "/v1/runtime/capabilities": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read runtime provider capabilities", operationId: "getRuntimeCapabilities", responses: { ...ok("Runtime capabilities", ref("RuntimeCapabilitiesResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/terminal/attach-ticket": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Create a short-lived terminal attach ticket", operationId: "createSandboxTerminalAttachTicket", parameters: [pathId], responses: { ...created("Terminal attach ticket", ref("SandboxTerminalAttachTicketResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/run": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Run a command in a sandbox", operationId: "runSandboxCommand", parameters: [pathId], requestBody: jsonBody(ref("RunSandboxBody")), responses: { ...ok("Command result", ref("RunSandboxResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/commands": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "List sandbox commands", operationId: "listSandboxCommands", parameters: [pathId], responses: { ...ok("Sandbox commands", ref("SandboxCommandsResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Sandbox Runtime"], summary: "Start a sandbox command", operationId: "createSandboxCommand", parameters: [pathId], requestBody: jsonBody(ref("CreateSandboxCommandBody")), responses: { ...created("Started sandbox command", ref("SandboxCommandResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/commands/{commandId}": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Get a sandbox command", operationId: "getSandboxCommand", parameters: [pathId, commandIdPath], responses: { ...ok("Sandbox command", ref("SandboxCommandResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Sandbox Runtime"], summary: "Interrupt a sandbox command", operationId: "killSandboxCommand", parameters: [pathId, commandIdPath], responses: { ...ok("Sandbox command", ref("SandboxCommandResponse")), ...authErrorResponses } })
    },
    "/v1/workspaces": {
      get: secured({ tags: ["Workspaces"], summary: "List organization workspaces and storage policy", operationId: "listWorkspaces", responses: { ...ok("Persistent workspaces", ref("WorkspacesResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Workspaces"], summary: "Allocate a persistent workspace", operationId: "createWorkspace", requestBody: jsonBody(ref("CreateWorkspaceBody")), responses: { ...created("Workspace metadata; volume provisioned on first attachment", ref("WorkspaceResponse")), ...authErrorResponses, "501": jsonResponse("Storage not enabled", ref("ApiErrorResponse")) } })
    },
    "/v1/workspaces/{id}": {
      get: secured({ tags: ["Workspaces"], summary: "Read an organization workspace", operationId: "getWorkspace", parameters: [pathId], responses: { ...ok("Persistent workspace", ref("WorkspaceResponse")), ...authErrorResponses } })
    },
    "/v1/workspaces/{id}/archive": {
      post: secured({ tags: ["Workspaces"], summary: "Archive a detached workspace, retaining storage and quota", operationId: "archiveWorkspace", parameters: [pathId], responses: { ...ok("Archived workspace; files are not deleted", ref("WorkspaceResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/commands/{commandId}/events": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Observe a tracked command without re-executing it", operationId: "streamSandboxCommand", parameters: [pathId, commandIdPath, parameter("cursor", "query", string, false), parameter("Last-Event-ID", "header", string, false)], responses: {
        "200": { description: "SSE with id=cursor, event=type, and JSON SandboxCommandEvent data. Native logs polled once per second; streams rotate at 60 seconds. Disconnect does not kill the command. Replay limited by runtime retention.", content: { "text/event-stream": { schema: { type: "string" } } }, "x-event-schema": ref("SandboxCommandEvent") }, ...authErrorResponses
      } })
    },
    "/v1/sandboxes/{id}/commands/{commandId}/logs": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox command logs", operationId: "getSandboxCommandLogs", parameters: [pathId, commandIdPath, parameter("cursor", "query", integer, false), parameter("tail", "query", integer, false)], responses: { ...ok("Sandbox command logs", ref("SandboxCommandLogsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/command-sessions": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Create a persistent command session", operationId: "createSandboxCommandSession", parameters: [pathId], requestBody: jsonBody(ref("CreateSandboxCommandSessionBody")), responses: { ...created("Created command session", ref("SandboxCommandSessionResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/command-sessions/{sessionId}": {
      delete: secured({ tags: ["Sandbox Runtime"], summary: "Delete a persistent command session", operationId: "deleteSandboxCommandSession", parameters: [pathId, sessionIdPath], responses: { ...ok("Deleted command session", ref("SandboxCommandSessionResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/command-sessions/{sessionId}/run": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Run a command in a persistent session", operationId: "runSandboxCommandSession", parameters: [pathId, sessionIdPath], requestBody: jsonBody(ref("RunSandboxCommandSessionBody")), responses: { ...ok("Command result", ref("RunSandboxCommandSessionResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/logs": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox logs", operationId: "getSandboxLogs", parameters: [pathId], responses: { ...ok("Sandbox logs", ref("SandboxLogsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "List sandbox files", operationId: "listSandboxFiles", parameters: [pathId, parameter("path", "query", string, false)], responses: { ...ok("Sandbox files", ref("SandboxFilesResponse")), ...authErrorResponses } }),
      put: secured({ tags: ["Sandbox Runtime"], summary: "Write a sandbox file", operationId: "writeSandboxFile", parameters: [pathId], requestBody: jsonBody(ref("SandboxFileWriteBody")), responses: { ...ok("Sandbox file", ref("SandboxFileWriteResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Sandbox Runtime"], summary: "Remove a sandbox file or directory", operationId: "removeSandboxFile", parameters: [pathId, parameter("path", "query", string, true), parameter("recursive", "query", boolean, false)], responses: { ...ok("Removed sandbox file", ref("SandboxFileRemoveResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/stat": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Stat a sandbox file", operationId: "statSandboxFile", parameters: [pathId, parameter("path", "query", string, true)], responses: { ...ok("Sandbox file metadata", ref("SandboxFileStatResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/read": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read a sandbox file", operationId: "readSandboxFile", parameters: [pathId, parameter("path", "query", string, true), parameter("encoding", "query", string, false)], responses: { ...ok("Sandbox file content", ref("SandboxFileReadResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/upload": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Upload a sandbox file artifact", operationId: "uploadSandboxFile", parameters: [pathId], requestBody: jsonBody(ref("SandboxFileUploadBody")), responses: { ...ok("Uploaded sandbox artifact", ref("SandboxFileUploadResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/download": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Download a sandbox file artifact", operationId: "downloadSandboxFile", parameters: [pathId, parameter("path", "query", string, true)], responses: { ...ok("Downloaded sandbox artifact", ref("SandboxFileDownloadResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/mkdir": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Create a sandbox directory", operationId: "mkdirSandboxFile", parameters: [pathId], requestBody: jsonBody(ref("SandboxFileMkdirBody")), responses: { ...ok("Sandbox directory", ref("SandboxFileMkdirResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files/rename": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Rename a sandbox file", operationId: "renameSandboxFile", parameters: [pathId], requestBody: jsonBody(ref("SandboxFileRenameBody")), responses: { ...ok("Renamed sandbox file", ref("SandboxFileRenameResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/metrics": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox metrics", operationId: "getSandboxMetrics", parameters: [pathId], responses: { ...ok("Sandbox metrics", ref("SandboxMetricsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials": {
      get: secured({ tags: ["Credential Vault"], summary: "List sandbox credential attachments", operationId: "listSandboxCredentials", parameters: [pathId], responses: { ...ok("Sandbox credential attachments", ref("SandboxCredentialsResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Credential Vault"], summary: "Attach a credential to a running sandbox", operationId: "attachSandboxCredential", parameters: [pathId], requestBody: jsonBody(ref("AttachSandboxCredentialBody")), responses: { ...created("Attached credential", ref("AttachSandboxCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials/rehydrate": {
      post: secured({ tags: ["Credential Vault"], summary: "Rehydrate stored sandbox credential attachments", operationId: "rehydrateSandboxCredentials", parameters: [pathId], responses: { ...ok("Rehydrated credential attachments", ref("RehydrateSandboxCredentialsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials/inspect": {
      post: secured({ tags: ["Credential Vault"], summary: "Compare attachments with sanitized runtime vault state", operationId: "inspectSandboxCredentials", parameters: [pathId], responses: { ...ok("Inspected credential attachments", ref("InspectSandboxCredentialsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials/{attachmentId}": {
      delete: secured({ tags: ["Credential Vault"], summary: "Detach a sandbox credential attachment", operationId: "detachSandboxCredential", parameters: [pathId, attachmentIdPath], responses: { ...ok("Detached credential", ref("DetachSandboxCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials/{attachmentId}/refresh": {
      post: secured({ tags: ["Credential Vault"], summary: "Refresh a dynamic sandbox credential", operationId: "refreshSandboxCredential", parameters: [pathId, attachmentIdPath], responses: { ...ok("Refreshed credential", ref("RefreshSandboxCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/credentials/{attachmentId}/test": {
      post: secured({ tags: ["Credential Vault"], summary: "Test a sandbox credential binding", operationId: "testSandboxCredential", parameters: [pathId, attachmentIdPath], requestBody: jsonBody(ref("TestSandboxCredentialBody")), responses: { ...ok("Credential binding test result", ref("TestSandboxCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/audit-events": {
      get: secured({
        tags: ["Credential Vault"],
        summary: "List sanitized organization audit events",
        operationId: "listAuditEvents",
        parameters: [
          parameter("targetType", "query", string, false),
          parameter("targetId", "query", string, false),
          parameter("actionPrefix", "query", string, false),
          parameter("limit", "query", integer, false),
          parameter("offset", "query", integer, false)
        ],
        responses: { ...ok("Organization audit events", ref("AuditEventsResponse")), ...authErrorResponses }
      })
    },
    "/v1/credential-presets": {
      get: secured({ tags: ["Credential Vault"], summary: "List built-in credential provider presets", operationId: "listCredentialProviderPresets", responses: { ...ok("Credential provider presets", ref("CredentialProviderPresetsResponse")), ...authErrorResponses } })
    },
    "/v1/credential-presets/{id}": {
      get: secured({ tags: ["Credential Vault"], summary: "Get a credential provider preset", operationId: "getCredentialProviderPreset", parameters: [credentialIdPath], responses: { ...ok("Credential provider preset", ref("CredentialProviderPresetResponse")), ...authErrorResponses } })
    },
    "/v1/credential-secrets": {
      get: secured({ tags: ["Credential Vault"], summary: "List encrypted workspace credential secrets", operationId: "listCredentialSecrets", parameters: [parameter("includeDeleted", "query", boolean, false)], responses: { ...ok("Credential secrets", ref("CredentialSecretsResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Credential Vault"], summary: "Create an encrypted workspace credential secret", operationId: "createCredentialSecret", requestBody: jsonBody(ref("CreateCredentialSecretBody")), responses: { ...created("Credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } })
    },
    "/v1/credential-secrets/{id}": {
      get: secured({ tags: ["Credential Vault"], summary: "Get sanitized credential secret metadata", operationId: "getCredentialSecret", parameters: [credentialIdPath], responses: { ...ok("Credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } }),
      patch: secured({ tags: ["Credential Vault"], summary: "Update workspace credential secret use policy", operationId: "updateCredentialSecret", parameters: [credentialIdPath], requestBody: jsonBody(ref("UpdateCredentialSecretBody")), responses: { ...ok("Updated credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Credential Vault"], summary: "Delete encrypted credential secret value custody", operationId: "deleteCredentialSecret", parameters: [credentialIdPath], responses: { ...ok("Deleted credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } })
    },
    "/v1/credential-secrets/{id}/rotate": {
      post: secured({ tags: ["Credential Vault"], summary: "Rotate an encrypted workspace credential secret", operationId: "rotateCredentialSecret", parameters: [credentialIdPath], requestBody: jsonBody(ref("RotateCredentialSecretBody")), responses: { ...ok("Rotated credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } })
    },
    "/v1/credential-secrets/{id}/disable": {
      post: secured({ tags: ["Credential Vault"], summary: "Disable a workspace credential secret", operationId: "disableCredentialSecret", parameters: [credentialIdPath], responses: { ...ok("Disabled credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } })
    },
    "/v1/credential-secrets/{id}/enable": {
      post: secured({ tags: ["Credential Vault"], summary: "Enable a workspace credential secret", operationId: "enableCredentialSecret", parameters: [credentialIdPath], responses: { ...ok("Enabled credential secret", ref("CredentialSecretResponse")), ...authErrorResponses } })
    },
    "/v1/external-secret-references": {
      get: secured({ tags: ["Credential Vault"], summary: "List external secret references", operationId: "listExternalSecretReferences", parameters: [parameter("includeDeleted", "query", boolean, false)], responses: { ...ok("External secret references", ref("ExternalSecretReferencesResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Credential Vault"], summary: "Create an external secret reference", operationId: "createExternalSecretReference", requestBody: jsonBody(ref("CreateExternalSecretReferenceBody")), responses: { ...created("External secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } })
    },
    "/v1/external-secret-references/{id}": {
      get: secured({ tags: ["Credential Vault"], summary: "Get sanitized external secret reference metadata", operationId: "getExternalSecretReference", parameters: [credentialIdPath], responses: { ...ok("External secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } }),
      patch: secured({ tags: ["Credential Vault"], summary: "Update an external secret reference", operationId: "updateExternalSecretReference", parameters: [credentialIdPath], requestBody: jsonBody(ref("UpdateExternalSecretReferenceBody")), responses: { ...ok("Updated external secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Credential Vault"], summary: "Delete an external secret reference", operationId: "deleteExternalSecretReference", parameters: [credentialIdPath], responses: { ...ok("Deleted external secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } })
    },
    "/v1/external-secret-references/{id}/validate": {
      post: secured({ tags: ["Credential Vault"], summary: "Validate an external secret reference", operationId: "validateExternalSecretReference", parameters: [credentialIdPath], responses: { ...ok("Validated external secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } })
    },
    "/v1/external-secret-references/{id}/disable": {
      post: secured({ tags: ["Credential Vault"], summary: "Disable an external secret reference", operationId: "disableExternalSecretReference", parameters: [credentialIdPath], responses: { ...ok("Disabled external secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } })
    },
    "/v1/external-secret-references/{id}/enable": {
      post: secured({ tags: ["Credential Vault"], summary: "Enable an external secret reference", operationId: "enableExternalSecretReference", parameters: [credentialIdPath], responses: { ...ok("Enabled external secret reference", ref("ExternalSecretReferenceResponse")), ...authErrorResponses } })
    },
    "/v1/dynamic-credential-issuers": {
      get: secured({ tags: ["Credential Vault"], summary: "List dynamic credential issuers", operationId: "listDynamicCredentialIssuers", parameters: [parameter("includeDeleted", "query", boolean, false)], responses: { ...ok("Dynamic credential issuers", ref("DynamicCredentialIssuersResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Credential Vault"], summary: "Create a dynamic credential issuer", operationId: "createDynamicCredentialIssuer", requestBody: jsonBody(ref("CreateDynamicCredentialIssuerBody")), responses: { ...created("Dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } })
    },
    "/v1/dynamic-credential-issuers/{id}": {
      get: secured({ tags: ["Credential Vault"], summary: "Get sanitized dynamic credential issuer metadata", operationId: "getDynamicCredentialIssuer", parameters: [credentialIdPath], responses: { ...ok("Dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } }),
      patch: secured({ tags: ["Credential Vault"], summary: "Update a dynamic credential issuer", operationId: "updateDynamicCredentialIssuer", parameters: [credentialIdPath], requestBody: jsonBody(ref("UpdateDynamicCredentialIssuerBody")), responses: { ...ok("Updated dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Credential Vault"], summary: "Delete a dynamic credential issuer", operationId: "deleteDynamicCredentialIssuer", parameters: [credentialIdPath], responses: { ...ok("Deleted dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } })
    },
    "/v1/dynamic-credential-issuers/{id}/validate": {
      post: secured({ tags: ["Credential Vault"], summary: "Validate a dynamic credential issuer", operationId: "validateDynamicCredentialIssuer", parameters: [credentialIdPath], responses: { ...ok("Validated dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } })
    },
    "/v1/dynamic-credential-issuers/{id}/disable": {
      post: secured({ tags: ["Credential Vault"], summary: "Disable a dynamic credential issuer", operationId: "disableDynamicCredentialIssuer", parameters: [credentialIdPath], responses: { ...ok("Disabled dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } })
    },
    "/v1/dynamic-credential-issuers/{id}/enable": {
      post: secured({ tags: ["Credential Vault"], summary: "Enable a dynamic credential issuer", operationId: "enableDynamicCredentialIssuer", parameters: [credentialIdPath], responses: { ...ok("Enabled dynamic credential issuer", ref("DynamicCredentialIssuerResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/egress": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox outbound access", operationId: "getSandboxEgress", parameters: [pathId], responses: { ...ok("Sandbox egress policy", ref("SandboxEgressResponse")), ...authErrorResponses } }),
      patch: secured({ tags: ["Sandbox Runtime"], summary: "Update sandbox outbound access", operationId: "updateSandboxEgress", parameters: [pathId], requestBody: jsonBody(ref("PatchSandboxEgressBody")), responses: { ...ok("Sandbox egress policy", ref("SandboxEgressResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/egress/test": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Test sandbox outbound access", operationId: "testSandboxEgress", parameters: [pathId], requestBody: jsonBody(ref("TestSandboxEgressBody")), responses: { ...ok("Sandbox egress test result", ref("TestSandboxEgressResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/routes": {
      get: secured({ tags: ["Routes"], summary: "List sandbox routes", operationId: "listSandboxRoutes", parameters: [pathId], responses: { ...ok("Sandbox routes", ref("SandboxRoutesResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Routes"], summary: "Expose a sandbox port", operationId: "exposeSandboxRoute", parameters: [pathId, parameter("Idempotency-Key", "header", string, false)], requestBody: jsonBody(ref("ExposeSandboxRouteBody")), responses: { ...created("Created sandbox route", ref("SandboxRouteResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/routes/{port}": {
      delete: secured({ tags: ["Routes"], summary: "Delete a sandbox route", operationId: "deleteSandboxRoute", parameters: [pathId, portPath], responses: { ...ok("Deleted sandbox route", ref("SandboxRouteResponse")), ...authErrorResponses } })
    },
    "/v1/api-keys": {
      get: secured({ tags: ["API Keys"], summary: "List API keys", operationId: "listApiKeys", responses: { ...ok("API keys", ref("ApiKeysResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["API Keys"], summary: "Create an API key", operationId: "createApiKey", requestBody: jsonBody(ref("CreateApiKeyBody")), responses: { ...created("Created API key", ref("CreateApiKeyResponse")), ...authErrorResponses } })
    },
    "/v1/api-keys/{id}": {
      delete: secured({ tags: ["API Keys"], summary: "Revoke an API key", operationId: "revokeApiKey", parameters: [pathId], responses: { ...noContent("Revoked API key"), ...authErrorResponses } })
    },
    "/v1/registry-credentials": {
      get: secured({ tags: ["Registry Credentials"], summary: "List registry credentials", operationId: "listRegistryCredentials", parameters: [parameter("includeRevoked", "query", string, false)], responses: { ...ok("Registry credentials", ref("RegistryCredentialsResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Registry Credentials"], summary: "Create or update a registry credential", operationId: "upsertRegistryCredential", requestBody: jsonBody(ref("UpsertRegistryCredentialBody")), responses: { ...created("Registry credential", ref("RegistryCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/registry-credentials/{id}": {
      delete: secured({ tags: ["Registry Credentials"], summary: "Revoke a registry credential", operationId: "revokeRegistryCredential", parameters: [credentialIdPath], responses: { ...ok("Revoked registry credential", ref("RegistryCredentialResponse")), ...authErrorResponses } })
    },
    "/v1/usage": {
      get: secured({ tags: ["Usage"], summary: "Read usage summary", operationId: "getUsage", responses: { ...ok("Usage summary", ref("UsageSummary")), ...authErrorResponses } })
    },
    "/v1/org/members": {
      get: secured({ tags: ["Members"], summary: "List organization members", operationId: "listOrganizationMembers", responses: { ...ok("Organization members", ref("OrganizationMembersResponse")), ...authErrorResponses } }),
      post: secured({ tags: ["Members"], summary: "Invite an organization member by email", operationId: "inviteOrganizationMemberCompat", requestBody: jsonBody(ref("AddOrganizationMemberBody")), responses: { ...created("Invited member", ref("AddOrganizationMemberResponse")), ...ok("Existing member or invite", ref("AddOrganizationMemberResponse")), ...authErrorResponses } })
    },
    "/v1/org/invitations": {
      post: secured({ tags: ["Members"], summary: "Invite an organization member by email", operationId: "createOrganizationInvitation", requestBody: jsonBody(ref("AddOrganizationMemberBody")), responses: { ...created("Invited member", ref("OrganizationInvitationResponse")), ...ok("Existing member or invite", ref("OrganizationInvitationResponse")), ...authErrorResponses } })
    },
    "/v1/org/invitations/{id}/resend": {
      post: secured({ tags: ["Members"], summary: "Resend an organization invitation", operationId: "resendOrganizationInvitation", parameters: [pathId], responses: { ...ok("Invitation", ref("OrganizationMemberMutationResponse")), ...authErrorResponses } })
    },
    "/v1/org/invitations/{id}/cancel": {
      post: secured({ tags: ["Members"], summary: "Cancel an organization invitation", operationId: "cancelOrganizationInvitation", parameters: [pathId], responses: { ...ok("Invitation", ref("OrganizationMemberMutationResponse")), ...authErrorResponses } })
    },
    "/v1/org/members/{id}": {
      delete: secured({ tags: ["Members"], summary: "Remove an organization member", operationId: "removeOrganizationMember", parameters: [pathId], responses: { ...ok("Removed member", ref("OrganizationMemberMutationResponse")), ...authErrorResponses } })
    },
    "/v1/org/settings": {
      get: secured({ tags: ["Organization Settings"], summary: "Read organization settings", operationId: "getOrganizationSettings", responses: { ...ok("Organization settings", ref("OrganizationSettingsResponse")), ...authErrorResponses } }),
      patch: secured({ tags: ["Organization Settings"], summary: "Update organization settings", operationId: "updateOrganizationSettings", requestBody: jsonBody(ref("UpdateOrganizationSettingsBody")), responses: { ...ok("Organization settings", ref("OrganizationSettingsResponse")), ...authErrorResponses, "409": jsonResponse("Capacity revision is stale; reload settings before retrying.", ref("ApiErrorResponse")) } })
    },
    "/v1/org/capacity": {
      get: secured({ tags: ["Organization Settings"], summary: "Read execution capacity", description: "Requires org:read. Counts held execution reservations, not running observations, host resources or billing. Counts are null while inventory is reconciling or quarantined.", operationId: "getOrganizationCapacity", responses: { ...ok("Organization capacity", ref("OrganizationCapacityResponse")), ...authErrorResponses, "503": jsonResponse("Capacity inventory unavailable.", ref("ApiErrorResponse")) } })
    }
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key"
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas
  }
} as const;

export const openApiPathMethodPairs = Object.entries(openApiDocument.paths).flatMap(([path, pathItem]) =>
  Object.keys(pathItem).map((method) => `${method.toUpperCase()} ${path}`)
);

export const openApiJson = () => `${JSON.stringify(openApiDocument, null, 2)}\n`;

import { sandboxRuntimeApiErrorCodes } from "./api-errors.js";

type JsonSchema = Record<string, unknown>;

type Operation = {
  tags: string[];
  summary: string;
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
  "429": jsonResponse("Rate or concurrency limited", ref("ApiErrorResponse")),
  "500": jsonResponse("Server error", ref("ApiErrorResponse"))
};

const secured = (operation: Operation): Operation => ({
  security: [{ apiKey: [] }, { bearerAuth: [] }],
  ...operation
});

const pathId = parameter("id", "path", string);
const commandIdPath = parameter("commandId", "path", string);
const sessionIdPath = parameter("sessionId", "path", string);
const portPath = parameter("port", "path", integer);
const templateIdPath = parameter("id", "path", string);
const buildIdPath = parameter("id", "path", string);
const credentialIdPath = parameter("id", "path", string);

const schemas: Record<string, JsonSchema> = {
  ApiErrorResponse: objectSchema({
    error: {
      ...string,
      description: "Stable machine-readable error code. Sandbox runtime endpoints use the SandboxRuntimeApiErrorCode vocabulary."
    },
    message: string
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
    egressPolicy: ref("EgressPolicyInput")
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
  SandboxSummary: objectSchema({
    id: string,
    opensandboxId: nullableString,
    name: string,
    template: string,
    status: { type: "string", enum: ["pending", "running", "idle", "error", "terminated"] },
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
    createdAt: dateTime
  }, ["id", "name", "template", "status", "cpu", "mem", "started", "owner", "cost", "ttlSeconds", "expiresAt", "publicUrl", "createdAt"]),
  SandboxOperationSummary: objectSchema({
    id: string,
    sandboxId: nullableString,
    kind: { type: "string", enum: ["provision", "delete", "renew", "route_expose"] },
    state: { type: "string", enum: ["queued", "running", "succeeded", "failed", "canceled"] },
    error: nullableString,
    attempts: integer,
    createdAt: dateTime,
    updatedAt: dateTime
  }),
  CreateSandboxBody: objectSchema({
    template: string,
    name: string,
    ttlSeconds: integer,
    env: { type: "object", additionalProperties: { type: "string" } },
    egress: ref("EgressPolicyInput"),
    idempotencyKey: string,
    wait: boolean,
    waitTimeoutMs: integer
  }, []),
  CreateSandboxResponse: objectSchema({
    sandbox: ref("SandboxSummary"),
    operation: ref("SandboxOperationSummary"),
    status: { type: "string", enum: ["created", "pending"] },
    message: string
  }, ["sandbox"]),
  SandboxesResponse: objectSchema({ sandboxes: arrayOf(ref("SandboxSummary")) }),
  SandboxResponse: objectSchema({ sandbox: ref("SandboxSummary") }),
  RunSandboxBody: objectSchema({
    command: string,
    stdin: string,
    cwd: string,
    env: { type: "object", additionalProperties: { type: "string" } },
    timeoutMs: integer
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
    detached: boolean
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
  SandboxFileUploadResponse: objectSchema({
    file: ref("SandboxFileEntry"),
    sizeBytes: integer,
    sha256: string
  }, ["file", "sizeBytes", "sha256"]),
  SandboxFileDownloadResponse: objectSchema({
    path: string,
    contentBase64: string,
    sizeBytes: integer,
    sha256: string
  }, ["path", "contentBase64", "sizeBytes", "sha256"]),
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
  RuntimeCapabilitySummary: objectSchema({
    name: {
      type: "string",
      enum: [
        "lifecycle",
        "commandRun",
        "commands",
        "commandLogs",
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
    revokedAt: { type: ["string", "null"], format: "date-time" }
  }),
  ApiKeysResponse: objectSchema({ keys: arrayOf(ref("ApiKeySummary")) }),
  CreateApiKeyBody: objectSchema({ name: string }),
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
    computeHours: number,
    avgColdStartMs: number,
    avgRuntimeSeconds: number,
    concurrentNow: integer,
    concurrentPeak: integer,
    series: arrayOf(number),
    topTemplates: arrayOf(objectSchema({ label: string, value: number })),
    statusBreakdown: arrayOf(objectSchema({ label: string, value: number }))
  }),
  OrganizationSettings: objectSchema({
    id: string,
    name: string,
    slug: string,
    idleTtlSeconds: integer,
    maxConcurrency: integer,
    defaultTemplateId: nullableString,
    defaultEgressPolicy: ref("EgressPolicyInput"),
    egressAllowedPresets: arrayOf({ type: "string", enum: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"] }),
    egressCustomDomainsEnabled: boolean,
    egressMaxRules: integer,
    egressRedactDomains: boolean
  }, ["name", "slug", "idleTtlSeconds", "maxConcurrency", "defaultTemplateId", "defaultEgressPolicy", "egressAllowedPresets", "egressCustomDomainsEnabled", "egressMaxRules", "egressRedactDomains"]),
  OrganizationSettingsResponse: objectSchema({ organization: ref("OrganizationSettings") }),
  AccountCapabilities: objectSchema({
    canManageMembers: boolean
  }),
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
    version: "0.1.0",
    description: "Control-plane API for sandbox lifecycle, templates, routes, registry credentials, and account settings."
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
        responses: { ...created("Created sandbox", ref("CreateSandboxResponse")), ...accepted("Queued sandbox", ref("CreateSandboxResponse")), ...authErrorResponses }
      })
    },
    "/v1/sandboxes/{id}": {
      get: secured({ tags: ["Sandboxes"], summary: "Get a sandbox", operationId: "getSandbox", parameters: [pathId], responses: { ...ok("Sandbox", ref("SandboxResponse")), ...authErrorResponses } }),
      delete: secured({ tags: ["Sandboxes"], summary: "Delete a sandbox", operationId: "deleteSandbox", parameters: [pathId], responses: { ...noContent("Deleted sandbox"), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/renew": {
      post: secured({ tags: ["Sandboxes"], summary: "Renew a sandbox TTL", operationId: "renewSandbox", parameters: [pathId], responses: { ...ok("Renewed sandbox", ref("OkResponse")), ...authErrorResponses } })
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
      patch: secured({ tags: ["Organization Settings"], summary: "Update organization settings", operationId: "updateOrganizationSettings", requestBody: jsonBody(ref("OrganizationSettings")), responses: { ...ok("Organization settings", ref("OrganizationSettingsResponse")), ...authErrorResponses } })
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

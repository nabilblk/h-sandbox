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
const portPath = parameter("port", "path", integer);
const templateIdPath = parameter("id", "path", string);
const buildIdPath = parameter("id", "path", string);
const credentialIdPath = parameter("id", "path", string);

const schemas: Record<string, JsonSchema> = {
  ApiErrorResponse: objectSchema({
    error: string,
    message: string
  }, ["error"]),
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
    runtimeFamily: string
  }, ["name"]),
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
    stdin: string
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
    files: arrayOf(ref("SandboxFileEntry"))
  }),
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
    protocol: { type: "string", enum: ["http", "https"] }
  }, ["port"]),
  SandboxRouteSummary: objectSchema({
    port: integer,
    protocol: { type: "string", enum: ["http", "https"] },
    routeKey: string,
    host: string,
    url: string,
    targetUrl: string,
    state: { type: "string", enum: ["provisioning", "ready", "unhealthy", "terminated"] },
    provider: string,
    providerRouteId: nullableString,
    createdAt: dateTime,
    lastCheckedAt: { type: ["string", "null"], format: "date-time" },
    terminatedAt: { type: ["string", "null"], format: "date-time" }
  }),
  SandboxRouteResponse: objectSchema({ route: ref("SandboxRouteSummary") }),
  SandboxRoutesResponse: objectSchema({ routes: arrayOf(ref("SandboxRouteSummary")) }),
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
    defaultTemplateId: nullableString
  }, ["name", "slug", "idleTtlSeconds", "maxConcurrency", "defaultTemplateId"]),
  OrganizationSettingsResponse: objectSchema({ organization: ref("OrganizationSettings") }),
  OrganizationMemberSummary: objectSchema({
    id: string,
    userId: string,
    email: string,
    fullName: nullableString,
    role: string,
    status: { type: "string", enum: ["active", "pending"] },
    keycloakLinked: boolean,
    joinedAt: dateTime
  }),
  OrganizationMembersResponse: objectSchema({ members: arrayOf(ref("OrganizationMemberSummary")) }),
  AddOrganizationMemberBody: objectSchema({ email: string }, ["email"]),
  AddOrganizationMemberResponse: objectSchema({
    member: ref("OrganizationMemberSummary"),
    created: boolean
  }),
  CurrentAccountResponse: objectSchema({
    user: objectSchema({
      id: string,
      email: string,
      fullName: nullableString,
      onboardingCompletedAt: { type: ["string", "null"], format: "date-time" }
    }),
    auth: freeObject,
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
    "/v1/sandboxes/{id}/run": {
      post: secured({ tags: ["Sandbox Runtime"], summary: "Run a command in a sandbox", operationId: "runSandboxCommand", parameters: [pathId], requestBody: jsonBody(ref("RunSandboxBody")), responses: { ...ok("Command result", ref("RunSandboxResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/logs": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox logs", operationId: "getSandboxLogs", parameters: [pathId], responses: { ...ok("Sandbox logs", ref("SandboxLogsResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/files": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "List sandbox files", operationId: "listSandboxFiles", parameters: [pathId, parameter("path", "query", string, false)], responses: { ...ok("Sandbox files", ref("SandboxFilesResponse")), ...authErrorResponses } })
    },
    "/v1/sandboxes/{id}/metrics": {
      get: secured({ tags: ["Sandbox Runtime"], summary: "Read sandbox metrics", operationId: "getSandboxMetrics", parameters: [pathId], responses: { ...ok("Sandbox metrics", ref("SandboxMetricsResponse")), ...authErrorResponses } })
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
      post: secured({ tags: ["Members"], summary: "Add an organization member by email", operationId: "addOrganizationMember", requestBody: jsonBody(ref("AddOrganizationMemberBody")), responses: { ...created("Added member", ref("AddOrganizationMemberResponse")), ...ok("Existing member", ref("AddOrganizationMemberResponse")), ...authErrorResponses } })
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

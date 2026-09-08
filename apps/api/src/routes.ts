import type { FastifyInstance } from "fastify";
import { apiErrorResponse } from "@harakiri/shared";
import websocket from "@fastify/websocket";
import { recordAuditEvent } from "./audit.js";
import { requireAuth } from "./auth.js";
import { authorizeRequest } from "./authorization.js";
import { query as defaultQuery, type Transaction } from "./db.js";
import { keycloakAdminClient, type KeycloakAdminClient } from "./providers/auth/keycloak-admin.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "./providers/runtime/index.js";
import type { ExternalSecretResolverRegistry } from "./providers/secrets/provider.js";
import type { DynamicCredentialIssuerRegistry } from "./providers/credentials/provider.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerAuditEventRoutes } from "./routes/audit-events.js";
import { registerCredentialPresetRoutes } from "./routes/credential-presets.js";
import { registerCredentialSecretRoutes } from "./routes/credential-secrets.js";
import { registerExternalSecretReferenceRoutes } from "./routes/external-secret-references.js";
import { registerDynamicCredentialIssuerRoutes } from "./routes/dynamic-credential-issuers.js";
import { registerOrgSettingsRoutes } from "./routes/org-settings.js";
import { registerRegistryCredentialRoutes } from "./routes/registry-credentials.js";
import { registerSandboxRoutes } from "./routes/sandboxes.js";
import { registerSandboxRuntimeRoutes } from "./routes/sandbox-runtime.js";
import { publicRoutePaths, registerSystemRoutes } from "./routes/system.js";
import { registerTemplateBuildRoutes } from "./routes/template-builds.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerWorkspaceRoutes } from "./routes/persistent-workspaces.js";
import { registerCommandEventRoutes } from "./routes/command-events.js";
import type { Query } from "./services/query.js";
import { recordSandboxEvent as createSandboxEventRecorder } from "./services/sandbox-events.js";
import { terminalAttachTicketQueryParam } from "./services/terminal-attach-tickets.js";

const defaultAudit = async (organizationId: string, actorUserId: string | null, actorLabel: string, action: string, targetType: string, targetId?: string, metadata = {}) =>
  recordAuditEvent({ organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata });

const terminalAttachPathPattern = /^\/v1\/sandboxes\/[^/]+\/terminal\/attach$/;

const isTicketAuthenticatedTerminalAttach = (url: string) => {
  const parsed = new URL(url, "http://harakiri.local");
  return terminalAttachPathPattern.test(parsed.pathname) && parsed.searchParams.has(terminalAttachTicketQueryParam);
};

export type RouteDependencies = {
  runtimeProvider?: RuntimeProvider;
  query?: Query;
  transaction?: Transaction;
  requireAuth?: typeof requireAuth;
  recordAudit?: typeof defaultAudit;
  recordSandboxEvent?: ReturnType<typeof createSandboxEventRecorder>;
  keycloakAdmin?: KeycloakAdminClient;
  externalSecretResolvers?: ExternalSecretResolverRegistry;
  dynamicCredentialIssuers?: DynamicCredentialIssuerRegistry;
};

export const registerRoutes = async (app: FastifyInstance, dependencies: RouteDependencies = {}) => {
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const query = dependencies.query ?? defaultQuery;
  const authHandler = dependencies.requireAuth ?? requireAuth;
  const audit = dependencies.recordAudit ?? defaultAudit;
  const event = dependencies.recordSandboxEvent ?? createSandboxEventRecorder(query);
  await app.register(websocket);
  await registerSystemRoutes(app);

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (request.method === "OPTIONS" || publicRoutePaths.has(path) || request.routeOptions.url === "/v1/route-proxy/:routeKey" || request.routeOptions.url === "/v1/route-proxy/:routeKey/*") return;
    if (request.method === "GET" && request.routeOptions.url === "/v1/sandboxes/:id/terminal/attach" && isTicketAuthenticatedTerminalAttach(request.url)) return;
    await authHandler(request, reply);
    if (reply.sent) return;
    if (!request.auth) return reply.code(401).send(apiErrorResponse("unauthorized"));
    return authorizeRequest(request, reply);
  });

  await registerAccountRoutes(app, { query, recordAudit: audit, keycloakAdmin: dependencies.keycloakAdmin ?? keycloakAdminClient });
  await registerTemplateRoutes(app, { query, recordAudit: audit });
  await registerTemplateBuildRoutes(app, { query, recordAudit: audit });
  await registerApiKeyRoutes(app, { query, recordAudit: audit });
  await registerAuditEventRoutes(app, { query });
  const externalSecretResolvers = dependencies.externalSecretResolvers;
  const dynamicIssuers = dependencies.dynamicCredentialIssuers;
  await registerSandboxRoutes(app, {
    transaction: dependencies.transaction,
    query, runtimeProvider, recordAudit: audit, recordSandboxEvent: event,
    externalSecretResolvers, dynamicCredentialIssuers: dynamicIssuers
  });
  await registerSandboxRuntimeRoutes(app, {
    transaction: dependencies.transaction,
    query, runtimeProvider, recordAudit: audit, recordSandboxEvent: event,
    externalSecretResolvers, dynamicCredentialIssuers: dynamicIssuers
  });
  await registerCredentialPresetRoutes(app);
  await registerCredentialSecretRoutes(app, {
    query, runtimeProvider, recordAudit: audit, recordEvent: event
  });
  await registerExternalSecretReferenceRoutes(app, {
    query, runtimeProvider, recordAudit: audit, recordEvent: event,
    resolvers: externalSecretResolvers
  });
  await registerDynamicCredentialIssuerRoutes(app, {
    query, runtimeProvider, recordAudit: audit, recordEvent: event,
    issuers: dynamicIssuers
  });
  await registerRegistryCredentialRoutes(app, { query, recordAudit: audit });
  await registerUsageRoutes(app, { query });
  await registerWorkspaceRoutes(app, { query, runtimeProvider, recordAudit: audit });
  await registerCommandEventRoutes(app, { query, runtimeProvider });
  await registerOrgSettingsRoutes(app, { query, recordAudit: audit });

};

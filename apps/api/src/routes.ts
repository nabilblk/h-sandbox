import type { FastifyInstance } from "fastify";
import { recordAuditEvent } from "./audit.js";
import { requireAuth } from "./auth.js";
import { query as defaultQuery } from "./db.js";
import { keycloakAdminClient, type KeycloakAdminClient } from "./providers/auth/keycloak-admin.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "./providers/runtime/index.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerOrgSettingsRoutes } from "./routes/org-settings.js";
import { registerRegistryCredentialRoutes } from "./routes/registry-credentials.js";
import { registerSandboxRoutes } from "./routes/sandboxes.js";
import { registerSandboxRuntimeRoutes } from "./routes/sandbox-runtime.js";
import { publicRoutePaths, registerSystemRoutes } from "./routes/system.js";
import { registerTemplateBuildRoutes } from "./routes/template-builds.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerUsageRoutes } from "./routes/usage.js";
import type { Query } from "./services/query.js";
import { recordSandboxEvent as createSandboxEventRecorder } from "./services/sandbox-events.js";

const defaultAudit = async (organizationId: string, actorUserId: string, actorLabel: string, action: string, targetType: string, targetId?: string, metadata = {}) =>
  recordAuditEvent({ organizationId, actorUserId, actorLabel, action, targetType, targetId, metadata });

export type RouteDependencies = {
  runtimeProvider?: RuntimeProvider;
  query?: Query;
  requireAuth?: typeof requireAuth;
  recordAudit?: typeof defaultAudit;
  recordSandboxEvent?: ReturnType<typeof createSandboxEventRecorder>;
  keycloakAdmin?: KeycloakAdminClient;
};

export const registerRoutes = async (app: FastifyInstance, dependencies: RouteDependencies = {}) => {
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const query = dependencies.query ?? defaultQuery;
  const authHandler = dependencies.requireAuth ?? requireAuth;
  const audit = dependencies.recordAudit ?? defaultAudit;
  const event = dependencies.recordSandboxEvent ?? createSandboxEventRecorder(query);
  await registerSystemRoutes(app);

  app.addHook("preHandler", async (request, reply) => {
    if (publicRoutePaths.has(request.url)) return;
    return authHandler(request, reply);
  });

  await registerAccountRoutes(app, { query, recordAudit: audit, keycloakAdmin: dependencies.keycloakAdmin ?? keycloakAdminClient });
  await registerTemplateRoutes(app, { query, recordAudit: audit });
  await registerTemplateBuildRoutes(app, { query, recordAudit: audit });
  await registerApiKeyRoutes(app, { query, recordAudit: audit });
  await registerSandboxRoutes(app, { query, runtimeProvider, recordAudit: audit, recordSandboxEvent: event });
  await registerSandboxRuntimeRoutes(app, { query, runtimeProvider, recordAudit: audit, recordSandboxEvent: event });
  await registerRegistryCredentialRoutes(app, { query, recordAudit: audit });
  await registerUsageRoutes(app, { query });
  await registerOrgSettingsRoutes(app, { query, recordAudit: audit });

};

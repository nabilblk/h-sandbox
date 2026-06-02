import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadDotEnv = () => {
  const candidates = Array.from(new Set([resolve(process.cwd(), ".env"), resolve(process.cwd(), "../..", ".env")]));
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [rawKey, ...rawValueParts] = trimmed.split("=");
      const key = rawKey.trim();
      if (!key || process.env[key] !== undefined) continue;
      const rawValue = rawValueParts.join("=").trim();
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
};

loadDotEnv();

const csv = (value: string | undefined, fallback = "") =>
  (value ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const bool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const defaultInsecureRegistry = (host: string) =>
  /(^localhost(?::|$)|^127\.|\.svc(?:\.|:|$)|\.cluster\.local(?::|$)|:5000$)/.test(host);

const templateRegistryPushHost = process.env.TEMPLATE_REGISTRY_PUSH_HOST ?? "harakiri-registry.harakiri.svc.cluster.local:5000";

export const deprecatedConfigWarnings = () => {
  const warnings: string[] = [];
  if (process.env.TEMPLATE_BUILDER_PROVIDER !== undefined) {
    warnings.push("TEMPLATE_BUILDER_PROVIDER is deprecated; use TEMPLATE_DOCKERFILE_BUILDER. The alias will be removed no earlier than 0.3.0.");
  }
  if (process.env.TEMPLATE_BUILDER_KANIKO_IMAGE !== undefined) {
    warnings.push(
      "TEMPLATE_BUILDER_KANIKO_IMAGE is deprecated; use TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE. The alias will be removed no earlier than 0.3.0."
    );
  }
  return warnings;
};

export const logDeprecatedConfigWarnings = (logger: (message: string) => void = console.warn) => {
  for (const warning of deprecatedConfigWarnings()) logger(warning);
};

export const config = {
  port: Number(process.env.API_PORT ?? 8080),
  host: process.env.API_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://harakiri:harakiri@127.0.0.1:15432/harakiri",
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:15173",
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://127.0.0.1:18082",
  keycloakIssuer: process.env.KEYCLOAK_ISSUER,
  keycloakIssuerAllowlist: (process.env.KEYCLOAK_ISSUER_ALLOWLIST ?? process.env.KEYCLOAK_ISSUER ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  keycloakJwksUrl: process.env.KEYCLOAK_JWKS_URL,
  keycloakAdminBaseUrl: process.env.KEYCLOAK_ADMIN_BASE_URL ?? "http://keycloak.keycloak.svc.cluster.local:8080",
  keycloakAdminRealm: process.env.KEYCLOAK_ADMIN_REALM ?? process.env.PUBLIC_KEYCLOAK_REALM ?? "harakiri",
  keycloakAdminTokenRealm: process.env.KEYCLOAK_ADMIN_TOKEN_REALM ?? "master",
  keycloakAdminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? "admin-cli",
  keycloakAdminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? "",
  keycloakAdminUsername: process.env.KEYCLOAK_ADMIN_USERNAME ?? process.env.KEYCLOAK_ADMIN ?? "",
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "",
  keycloakInvitationClientId: process.env.KEYCLOAK_INVITATION_CLIENT_ID ?? process.env.PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web",
  keycloakInvitationRedirectUri:
    process.env.KEYCLOAK_INVITATION_REDIRECT_URI ?? `${process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:15173"}#dashboard/sandboxes`,
  keycloakInvitationLifespanSeconds: Number(process.env.KEYCLOAK_INVITATION_LIFESPAN_SECONDS ?? 7 * 24 * 60 * 60),
  authDevAllow: process.env.AUTH_DEV_ALLOW === "1",
  openSandboxBaseUrl: process.env.OPEN_SANDBOX_BASE_URL ?? "http://127.0.0.1:8088",
  openSandboxGatewayUrl: process.env.OPEN_SANDBOX_GATEWAY_URL ?? "http://127.0.0.1:18085",
  publicOpenSandboxUrl: process.env.PUBLIC_OPEN_SANDBOX_URL ?? "http://127.0.0.1:18083",
  openSandboxApiKey: process.env.OPEN_SANDBOX_API_KEY ?? "dev-opensandbox-key",
  openSandboxAllowFallback: process.env.OPEN_SANDBOX_ALLOW_FALLBACK !== "0",
  runtimeProvider: process.env.HARAKIRI_RUNTIME_PROVIDER ?? process.env.RUNTIME_PROVIDER ?? "opensandbox",
  sandboxRouteMode: process.env.SANDBOX_ROUTE_MODE ?? "local-proxy",
  sandboxRouteBaseDomain: process.env.SANDBOX_ROUTE_BASE_DOMAIN ?? "sandbox.localhost",
  sandboxRoutePublicScheme: process.env.SANDBOX_ROUTE_PUBLIC_SCHEME ?? "https",
  sandboxRouteLocalFallbackUrl: process.env.SANDBOX_ROUTE_LOCAL_FALLBACK_URL ?? process.env.PUBLIC_OPEN_SANDBOX_URL ?? "http://127.0.0.1:18083",
  sandboxMaxRoutesPerSandbox: Number(process.env.SANDBOX_MAX_ROUTES_PER_SANDBOX ?? 8),
  sandboxMaxRoutesPerOrg: Number(process.env.SANDBOX_MAX_ROUTES_PER_ORG ?? 200),
  sandboxFileArtifactMaxBytes: Number(process.env.SANDBOX_FILE_ARTIFACT_MAX_BYTES ?? 16 * 1024 * 1024),
  terminalAttachTicketTtlSeconds: Number(process.env.TERMINAL_ATTACH_TICKET_TTL_SECONDS ?? 60),
  sandboxOperationWorkerLimit: Number(process.env.SANDBOX_OPERATION_WORKER_LIMIT ?? 10),
  sandboxOperationMaxAttempts: Number(process.env.SANDBOX_OPERATION_MAX_ATTEMPTS ?? 3),
  sandboxOperationLeaseMs: Number(process.env.SANDBOX_OPERATION_LEASE_MS ?? 5 * 60 * 1000),
  controlPlaneSecretKey:
    process.env.CONTROL_PLANE_SECRET_KEY ?? process.env.HARAKIRI_SECRET_KEY ?? process.env.TEMPLATE_REGISTRY_CREDENTIAL_KEY ?? "",
  templateMaxCpuCount: Number(process.env.TEMPLATE_MAX_CPU_COUNT ?? 8),
  templateMaxMemoryMb: Number(process.env.TEMPLATE_MAX_MEMORY_MB ?? 32768),
  templateMaxDefaultPorts: Number(process.env.TEMPLATE_MAX_DEFAULT_PORTS ?? 16),
  templateBuildMaxActivePerOrg: Number(process.env.TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG ?? 3),
  templateImageAllowRegistries: csv(
    process.env.TEMPLATE_IMAGE_ALLOW_REGISTRIES,
    "docker.io,registry-1.docker.io,mcr.microsoft.com,gcr.io,ghcr.io,127.0.0.1:5000,harakiri-registry.harakiri.svc.cluster.local:5000"
  ),
  templateImageDenyRegistries: csv(process.env.TEMPLATE_IMAGE_DENY_REGISTRIES),
  templateImageAllowPrefixes: csv(process.env.TEMPLATE_IMAGE_ALLOW_PREFIXES),
  templateImageDenyPrefixes: csv(process.env.TEMPLATE_IMAGE_DENY_PREFIXES),
  templateBuildContextMaxBytes: Number(process.env.TEMPLATE_BUILD_CONTEXT_MAX_BYTES ?? 25 * 1024 * 1024),
  templateBuilderNamespace: process.env.TEMPLATE_BUILDER_NAMESPACE ?? "harakiri",
  templateBuilderJobImage: process.env.TEMPLATE_BUILDER_JOB_IMAGE ?? "harakiri-api:dev",
  templateDockerfileBuilder: process.env.TEMPLATE_DOCKERFILE_BUILDER ?? process.env.TEMPLATE_BUILDER_PROVIDER ?? "buildkit",
  templateBuildkitImage: process.env.TEMPLATE_BUILDKIT_IMAGE ?? "moby/buildkit:rootless",
  templateBuildkitdFlags: process.env.TEMPLATE_BUILDKITD_FLAGS ?? "--oci-worker-no-process-sandbox",
  templateBuildkitRegistryInsecure: bool(process.env.TEMPLATE_BUILDKIT_REGISTRY_INSECURE, defaultInsecureRegistry(templateRegistryPushHost)),
  templateLegacyDockerfileBuilderImage:
    process.env.TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE ?? process.env.TEMPLATE_BUILDER_KANIKO_IMAGE ?? "gcr.io/kaniko-project/executor:v1.24.0",
  templateBuilderJobTimeoutMs: Number(process.env.TEMPLATE_BUILDER_JOB_TIMEOUT_MS ?? 15 * 60 * 1000),
  templateRegistryPushHost,
  templateRegistryRuntimeHost: process.env.TEMPLATE_REGISTRY_RUNTIME_HOST ?? "127.0.0.1:5000",
  templateRegistryRepositoryPrefix: process.env.TEMPLATE_REGISTRY_REPOSITORY_PREFIX ?? "harakiri/templates",
  templateRegistryCredentialKey: process.env.TEMPLATE_REGISTRY_CREDENTIAL_KEY ?? "",
  templateScannerWebhookUrl: process.env.TEMPLATE_SCANNER_WEBHOOK_URL ?? "",
  templateScannerTimeoutMs: Number(process.env.TEMPLATE_SCANNER_TIMEOUT_MS ?? 10_000),
  templateScannerFailOnError: process.env.TEMPLATE_SCANNER_FAIL_ON_ERROR === "1",
  templateRuntimePullPreflightEnabled: process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED !== "0",
  templateRuntimePullPreflightNamespace: process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE ?? "opensandbox",
  templateRuntimePullPreflightTimeoutMs: Number(process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS ?? 120_000),
  templateImagePrepullEnabled: process.env.TEMPLATE_IMAGE_PREPULL_ENABLED === "1",
  templateImagePrepullNamespace: process.env.TEMPLATE_IMAGE_PREPULL_NAMESPACE ?? process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE ?? "opensandbox",
  templateImagePrepullTimeoutMs: Number(process.env.TEMPLATE_IMAGE_PREPULL_TIMEOUT_MS ?? 120_000),
  templateImagePrepullHotTags: csv(process.env.TEMPLATE_IMAGE_PREPULL_HOT_TAGS, "hot,prepull,warm"),
  templateImagePrepullFailOnError: process.env.TEMPLATE_IMAGE_PREPULL_FAIL_ON_ERROR === "1",
  templateRetentionEnabled: process.env.TEMPLATE_RETENTION_ENABLED !== "0",
  templateRetentionIntervalMs: Number(process.env.TEMPLATE_RETENTION_INTERVAL_MS ?? 60 * 60 * 1000),
  templateBuildRetentionDays: Number(process.env.TEMPLATE_BUILD_RETENTION_DAYS ?? 30),
  templateBuildLogRetentionDays: Number(process.env.TEMPLATE_BUILD_LOG_RETENTION_DAYS ?? 14),
  templateBuildContextRetentionDays: Number(process.env.TEMPLATE_BUILD_CONTEXT_RETENTION_DAYS ?? 7),
  templateVersionRetentionDays: Number(process.env.TEMPLATE_VERSION_RETENTION_DAYS ?? 90),
  templateBuilderJobRetentionDays: Number(process.env.TEMPLATE_BUILDER_JOB_RETENTION_DAYS ?? 1),
  templateRetentionDeleteBuilderJobs: process.env.TEMPLATE_RETENTION_DELETE_BUILDER_JOBS !== "0",
  templateBuilderPollMs: Number(process.env.TEMPLATE_BUILDER_POLL_MS ?? 5000),
  templateBuilderOnce: process.env.TEMPLATE_BUILDER_ONCE === "1",
  autoMigrate: process.env.AUTO_MIGRATE === "1",
  seedOnBoot: process.env.SEED_ON_BOOT === "1"
};

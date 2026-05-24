const csv = (value: string | undefined, fallback = "") =>
  (value ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.API_PORT ?? 8080),
  host: process.env.API_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://harakiri:harakiri@127.0.0.1:15432/harakiri",
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://127.0.0.1:18082",
  keycloakIssuer: process.env.KEYCLOAK_ISSUER,
  keycloakIssuerAllowlist: (process.env.KEYCLOAK_ISSUER_ALLOWLIST ?? process.env.KEYCLOAK_ISSUER ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  keycloakJwksUrl: process.env.KEYCLOAK_JWKS_URL,
  authDevAllow: process.env.AUTH_DEV_ALLOW === "1",
  openSandboxBaseUrl: process.env.OPEN_SANDBOX_BASE_URL ?? "http://127.0.0.1:8088",
  publicOpenSandboxUrl: process.env.PUBLIC_OPEN_SANDBOX_URL ?? "http://127.0.0.1:18083",
  openSandboxApiKey: process.env.OPEN_SANDBOX_API_KEY ?? "dev-opensandbox-key",
  openSandboxAllowFallback: process.env.OPEN_SANDBOX_ALLOW_FALLBACK !== "0",
  sandboxRouteMode: process.env.SANDBOX_ROUTE_MODE ?? "local-proxy",
  sandboxRouteBaseDomain: process.env.SANDBOX_ROUTE_BASE_DOMAIN ?? "harakiri.io",
  sandboxRoutePublicScheme: process.env.SANDBOX_ROUTE_PUBLIC_SCHEME ?? "https",
  sandboxRouteLocalFallbackUrl: process.env.SANDBOX_ROUTE_LOCAL_FALLBACK_URL ?? process.env.PUBLIC_OPEN_SANDBOX_URL ?? "http://127.0.0.1:18083",
  sandboxMaxRoutesPerSandbox: Number(process.env.SANDBOX_MAX_ROUTES_PER_SANDBOX ?? 8),
  sandboxMaxRoutesPerOrg: Number(process.env.SANDBOX_MAX_ROUTES_PER_ORG ?? 200),
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
  templateBuilderKanikoImage: process.env.TEMPLATE_BUILDER_KANIKO_IMAGE ?? "gcr.io/kaniko-project/executor:v1.24.0",
  templateBuilderJobTimeoutMs: Number(process.env.TEMPLATE_BUILDER_JOB_TIMEOUT_MS ?? 15 * 60 * 1000),
  templateRegistryPushHost: process.env.TEMPLATE_REGISTRY_PUSH_HOST ?? "harakiri-registry.harakiri.svc.cluster.local:5000",
  templateRegistryRuntimeHost: process.env.TEMPLATE_REGISTRY_RUNTIME_HOST ?? "127.0.0.1:5000",
  templateRegistryRepositoryPrefix: process.env.TEMPLATE_REGISTRY_REPOSITORY_PREFIX ?? "harakiri/templates",
  templateScannerWebhookUrl: process.env.TEMPLATE_SCANNER_WEBHOOK_URL ?? "",
  templateScannerTimeoutMs: Number(process.env.TEMPLATE_SCANNER_TIMEOUT_MS ?? 10_000),
  templateScannerFailOnError: process.env.TEMPLATE_SCANNER_FAIL_ON_ERROR === "1",
  templateRuntimePullPreflightEnabled: process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED !== "0",
  templateRuntimePullPreflightNamespace: process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE ?? "opensandbox",
  templateRuntimePullPreflightTimeoutMs: Number(process.env.TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS ?? 120_000),
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

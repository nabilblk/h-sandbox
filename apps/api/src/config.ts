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
  templateBuildContextMaxBytes: Number(process.env.TEMPLATE_BUILD_CONTEXT_MAX_BYTES ?? 25 * 1024 * 1024),
  templateBuilderPollMs: Number(process.env.TEMPLATE_BUILDER_POLL_MS ?? 5000),
  templateBuilderOnce: process.env.TEMPLATE_BUILDER_ONCE === "1",
  autoMigrate: process.env.AUTO_MIGRATE === "1",
  seedOnBoot: process.env.SEED_ON_BOOT === "1"
};

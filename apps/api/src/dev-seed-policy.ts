export function assertDevelopmentSeedAllowed(input: { runtimeProvider: string; authDevAllow: boolean; nodeEnv?: string }) {
  if (input.runtimeProvider !== "dev" || !input.authDevAllow || input.nodeEnv === "production") {
    throw new Error("Development seeding requires the dev runtime, AUTH_DEV_ALLOW=1 and a non-production environment. Never seed a shared or public installation.");
  }
}

import { defineConfig } from "@playwright/test";

const managedPort = Number(process.env.HARAKIRI_E2E_WEB_PORT ?? 15173);
if (!Number.isInteger(managedPort) || managedPort < 1 || managedPort > 65535) {
  throw new Error("HARAKIRI_E2E_WEB_PORT must be a valid TCP port");
}
const managedUrl = `http://127.0.0.1:${managedPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "docs/artifacts/playwright-report" }]
  ],
  use: {
    baseURL: process.env.HARAKIRI_WEB_URL ?? managedUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.HARAKIRI_E2E_MANAGED_SERVER === "1" ? {
    command: `WEB_PORT=${managedPort} pnpm --filter @harakiri/web dev`,
    url: managedUrl,
    reuseExistingServer: false,
    timeout: 120_000
  } : undefined
});

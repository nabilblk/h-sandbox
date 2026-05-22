import { defineConfig } from "@playwright/test";

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
    baseURL: process.env.HARAKIRI_WEB_URL ?? "http://127.0.0.1:15173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});

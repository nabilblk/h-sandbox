import { HarakiriApiError, HarakiriClient } from "@harakiri/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandbox;
try {
  const created = await harakiri.createSandbox({
    template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12-data",
    name: "sdk-basic-command",
    wait: false,
    idempotencyKey: `sdk-basic-command-${Date.now()}`
  });
  sandbox = created.sandbox;
  await harakiri.waitForSandbox(sandbox.id, { timeoutMs: 90_000 });

  const result = await harakiri.runSandbox(sandbox.id, {
    command: "python - <<'PY'\nimport sys\nprint('hello from harakiri')\nprint(sys.version.split()[0])\nPY",
    cwd: "/workspace",
    timeoutMs: 30_000
  });

  process.stdout.write(result.result.stdout);
  if (result.result.exitCode !== 0) throw new Error(result.result.stderr || "command failed");
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error(error.message, { code: error.code, retryable: error.retryable });
  }
  throw error;
} finally {
  if (sandbox) await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}

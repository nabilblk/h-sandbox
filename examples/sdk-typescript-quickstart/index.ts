import { HarakiriClient, type CreateSandboxInput, type SandboxRouteResponse } from "@harakiri/sdk";

const apiUrl = process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io";
const apiKey = process.env.HARAKIRI_API_KEY;

if (!apiKey) {
  throw new Error("Set HARAKIRI_API_KEY before running this example.");
}

const harakiri = new HarakiriClient({ apiUrl, apiKey });

const sandboxInput: CreateSandboxInput = {
  template: "python-3.12-data",
  ttlSeconds: 300,
  idempotencyKey: `ts-quickstart-${Date.now()}`,
  egress: { mode: "restricted", presets: ["python-package-install"] }
};

const { sandbox } = await harakiri.createSandbox(sandboxInput);

try {
  await harakiri.waitForSandbox(sandbox.id);
  await harakiri.files.write(sandbox.id, {
    path: "/workspace/hello.py",
    content: "print('hello from harakiri')\n",
    createParents: true
  });

  const { result } = await harakiri.runSandbox(sandbox.id, {
    command: "python /workspace/hello.py",
    timeoutMs: 30_000
  });

  if (result.exitCode !== 0) throw new Error(result.stderr || "command failed");

  const route: SandboxRouteResponse = await harakiri.routes.expose(sandbox.id, {
    port: 3000,
    accessMode: "token",
    labels: ["typescript-example"]
  });

  console.log(result.stdout.trim());
  console.log(route.route.url);
} finally {
  await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}

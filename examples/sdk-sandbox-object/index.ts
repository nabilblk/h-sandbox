import { HarakiriClient, HarakiriSandbox } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io";
const apiKey = process.env.HARAKIRI_API_KEY;

if (!apiKey) {
  throw new Error("Set HARAKIRI_API_KEY before running this example.");
}

const harakiri = new HarakiriClient({ apiUrl, apiKey });

const sandbox = await harakiri.sandboxes.create({
  template: "python-3.12-data",
  name: "sdk-sandbox-object",
  ttlSeconds: 600,
  wait: false,
  idempotencyKey: `sandbox-object-${Date.now()}`,
  egress: { mode: "restricted", presets: ["python-package-install"] }
});

try {
  await sandbox.wait({ timeoutMs: 90_000 });

  await sandbox.files.write({
    path: "/workspace/hello.py",
    content: "print('hello from the HarakiriSandbox object')\n",
    createParents: true
  });

  const run = await sandbox.run({
    command: "python /workspace/hello.py",
    timeoutMs: 30_000
  });
  if (run.result.exitCode !== 0) throw new Error(run.result.stderr || "command failed");

  const server = await sandbox.commands.start({
    command: "python -m http.server 3000 --bind 0.0.0.0",
    cwd: "/workspace",
    detached: true
  });
  await sandbox.commands.wait(server.command.id, { statuses: ["running"] });

  const route = await sandbox.routes.expose({
    port: 3000,
    accessMode: "token",
    labels: ["sandbox-object-example"]
  });

  const reconnected = await HarakiriSandbox.connect(harakiri, sandbox.id);

  console.log(run.result.stdout.trim());
  console.log(`sandbox: ${reconnected.id} ${reconnected.status}`);
  console.log(`route: ${route.route.url}`);
} finally {
  await sandbox.kill().catch(() => undefined);
}

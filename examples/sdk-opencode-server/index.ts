import { createOpencodeClient } from "@opencode-ai/sdk";
import { HarakiriClient, HarakiriWaitTimeoutError } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io";
const apiKey = process.env.HARAKIRI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const serverPassword = process.env.OPENCODE_SERVER_PASSWORD ?? crypto.randomUUID();

if (!apiKey) throw new Error("Set HARAKIRI_API_KEY before running this example.");

const harakiri = new HarakiriClient({ apiUrl, apiKey });

let sandboxId: string | undefined;

try {
  const { sandbox } = await harakiri.createSandbox({
    template: "opencode",
    name: "sdk-opencode-server",
    ttlSeconds: 1200,
    wait: true,
    env: {
      ...(anthropicApiKey ? { ANTHROPIC_API_KEY: anthropicApiKey } : {}),
      OPENCODE_SERVER_PASSWORD: serverPassword
    },
    egress: {
      mode: "restricted",
      presets: ["llm-apis", "node-package-install"]
    }
  });
  sandboxId = sandbox.id;

  const { command } = await harakiri.commands.start(sandbox.id, {
    command: "opencode serve --hostname 0.0.0.0 --port 4096",
    cwd: "/workspace",
    detached: true
  });
  await harakiri.commands.wait(sandbox.id, command.id, {
    statuses: ["running"],
    timeoutMs: 30_000,
    intervalMs: 500
  });

  const route = await harakiri.routes.exposeAndWait(sandbox.id, {
    port: 4096,
    accessMode: "token",
    labels: ["opencode"]
  }, {
    path: "/global/health",
    basicAuth: { username: "opencode", password: serverPassword },
    timeoutMs: 60_000,
    expect: async (response) => response.ok && (await response.clone().json()).healthy === true
  });

  const opencode = createOpencodeClient({
    baseUrl: route.route.url,
    fetch: harakiri.routes.fetch(route, {
      basicAuth: { username: "opencode", password: serverPassword }
    })
  });

  const config = await opencode.config.get();
  console.log(`OpenCode server is reachable at ${route.route.url}`);
  console.log(`OpenCode config keys: ${Object.keys(config.data ?? {}).join(", ")}`);
} catch (error) {
  if (error instanceof HarakiriWaitTimeoutError && error.target === "route") {
    console.error("OpenCode route did not become healthy. Check that the server binds to 0.0.0.0:4096.");
  }
  throw error;
} finally {
  if (sandboxId) await harakiri.killSandbox(sandboxId).catch(() => undefined);
}

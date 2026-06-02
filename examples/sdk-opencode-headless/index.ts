import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const apiUrl = process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io";
const apiKey = process.env.HARAKIRI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const repositoryUrl = process.env.OPENCODE_REPOSITORY_URL;
const prompt = process.env.OPENCODE_PROMPT ?? "Inspect the project and summarize the most important files.";

if (!apiKey) throw new Error("Set HARAKIRI_API_KEY before running this example.");
if (!anthropicApiKey) throw new Error("Set ANTHROPIC_API_KEY before running this example.");

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const harakiri = new HarakiriClient({ apiUrl, apiKey });

let sandboxId: string | undefined;

try {
  const { sandbox } = await harakiri.createSandbox({
    template: "opencode",
    name: "sdk-opencode-headless",
    ttlSeconds: 1200,
    wait: true,
    env: {
      ANTHROPIC_API_KEY: anthropicApiKey
    },
    egress: {
      mode: "restricted",
      presets: ["git-hosting", "llm-apis", "node-package-install"]
    }
  });
  sandboxId = sandbox.id;

  if (repositoryUrl) {
    const clone = await harakiri.runSandbox(sandbox.id, {
      command: `rm -rf /workspace/project && git clone --depth 1 ${shellQuote(repositoryUrl)} /workspace/project`,
      cwd: "/workspace",
      timeoutMs: 120_000
    });
    if (clone.result.exitCode !== 0) throw new Error(clone.result.stderr || "git clone failed");
  }

  const cwd = repositoryUrl ? "/workspace/project" : "/workspace";
  const run = await harakiri.runSandbox(sandbox.id, {
    command: `opencode run ${shellQuote(prompt)}`,
    cwd,
    timeoutMs: 300_000
  });
  if (run.result.exitCode !== 0) throw new Error(run.result.stderr || "opencode run failed");

  console.log(run.result.stdout.trim());

  if (repositoryUrl) {
    const diff = await harakiri.runSandbox(sandbox.id, {
      command: "git diff -- . ':!node_modules'",
      cwd: "/workspace/project",
      timeoutMs: 30_000
    });
    if (diff.result.stdout.trim()) {
      console.log("\n--- git diff ---\n");
      console.log(diff.result.stdout);
    }
  }
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error(`${error.code ?? "api_error"}: ${error.message}`);
  }
  throw error;
} finally {
  if (sandboxId) await harakiri.killSandbox(sandboxId).catch(() => undefined);
}

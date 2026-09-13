import { HarakiriApiError, HarakiriClient, type HarakiriSandbox } from "@h-sandbox/sdk";

// Unreleased SDK recipe; see docs/sdk-developer-experience.md for package setup.
// Model availability is external; select a currently available model with `opencode models`.
const model = process.env.OPENCODE_MODEL;
const repositoryUrl = process.env.OPENCODE_REPOSITORY_URL;
const prompt = process.env.OPENCODE_PROMPT ?? "Inspect the project and summarize the most important files.";

if (!model) throw new Error("Set OPENCODE_MODEL to a model available in your OpenCode installation.");

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const harakiri = HarakiriClient.fromEnv();

let sandbox: HarakiriSandbox | undefined;

try {
  sandbox = await harakiri.sandboxes.create({
    template: process.env.HARAKIRI_TEMPLATE ?? "opencode",
    name: "sdk-opencode-headless",
    ttlSeconds: 1200,
    wait: true,
    egress: {
      mode: "restricted",
      presets: ["git-hosting", "llm-apis", "node-package-install"]
    }
  });
  const cwd = repositoryUrl ? `${sandbox.runtimeMetadata.workdir}/project` : sandbox.runtimeMetadata.workdir;
  if (repositoryUrl) {
    await sandbox.git.clone(repositoryUrl, { targetPath: cwd, depth: 1, timeoutMs: 120_000 });
  }
  const run = await sandbox.run(`opencode run --model ${shellQuote(model)} ${shellQuote(prompt)}`, {
    cwd,
    check: true,
    timeoutMs: 300_000
  });
  console.log(run.stdout.trim());

  if (repositoryUrl) {
    console.log(await sandbox.git.status({ cwd }));
    const diff = await sandbox.run("git diff -- . ':!node_modules'", {
      cwd,
      check: true,
      timeoutMs: 30_000
    });
    if (diff.stdout.trim()) {
      console.log("\n--- git diff ---\n");
      console.log(diff.stdout);
    }
    // An agent response is not verification. Use a repository-owned test command.
    if (process.env.OPENCODE_VERIFY_COMMAND) {
      console.log((await sandbox.run(process.env.OPENCODE_VERIFY_COMMAND, { cwd, check: true, timeoutMs: 120_000 })).stdout);
    }
  }
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error(`${error.code ?? "api_error"}: ${error.message}`);
  }
  throw error;
} finally {
  if (sandbox) await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}

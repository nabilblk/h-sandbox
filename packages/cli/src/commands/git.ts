import type { Command } from "commander";
import type { GitCredentials } from "@h-sandbox/sdk";
import { apiClient } from "../config.js";
import { parsePositiveInt, printProgress } from "../utils.js";

export const gitCredentialsFromOptions = (options: { tokenEnv?: string; username?: string }): GitCredentials | undefined => {
  if (!options.tokenEnv) return undefined;
  const token = process.env[options.tokenEnv];
  if (!token) throw new Error(`environment variable ${options.tokenEnv} is not set`);
  return { type: "token", token, username: options.username };
};

const persistenceFromOptions = (options: { preserveCredentials?: boolean }) =>
  options.preserveCredentials ? "dangerously-store-in-remote" as const : undefined;

const printRun = (result: { stdout: string; stderr: string; exitCode: number }) => {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
};

export const registerGitCommands = (program: Command) => {
  const git = program
    .command("git")
    .description("Run Git workflows through the Harakiri sandbox command API");

  git
    .command("clone")
    .argument("<id>", "sandbox id")
    .argument("<repo>", "Git repository URL")
    .option("--branch <branch>", "branch or tag to clone")
    .option("--commit <sha>", "commit to checkout after clone")
    .option("--path <path>", "target path inside the sandbox", "/workspace/project")
    .option("--depth <n>", "shallow clone depth", parsePositiveInt)
    .option("--submodules", "initialize submodules recursively")
    .option("--token-env <name>", "environment variable containing an HTTPS Git token")
    .option("--username <name>", "HTTPS Git username; defaults to x-access-token for token auth")
    .option("--preserve-credentials", "dangerously leave credentials in the Git remote URL")
    .option("--timeout-ms <ms>", "command timeout in milliseconds", parsePositiveInt)
    .description("Clone a repository into a running sandbox")
    .action(async (id, repo, options) => {
      const client = await apiClient();
      const result = await client.git.clone(id, repo, {
        branch: options.branch,
        commit: options.commit,
        targetPath: options.path,
        depth: options.depth,
        submodules: options.submodules ? "recursive" : undefined,
        credentials: gitCredentialsFromOptions(options),
        credentialPersistence: persistenceFromOptions(options),
        timeoutMs: options.timeoutMs
      });
      printProgress(`cloned ${result.url} -> ${result.path}`);
      printRun(result);
    });

  git
    .command("status")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .option("--timeout-ms <ms>", "command timeout in milliseconds", parsePositiveInt)
    .description("Show Git status")
    .action(async (id, options) => {
      const client = await apiClient();
      const status = await client.git.status(id, { cwd: options.cwd, timeoutMs: options.timeoutMs });
      console.log(`branch\t${status.branch ?? "-"}\tupstream\t${status.upstream ?? "-"}\tahead\t${status.ahead}\tbehind\t${status.behind}`);
      if (status.clean) {
        console.log("clean");
        return;
      }
      for (const file of status.files) console.log(`${file.index}${file.workingTree}\t${file.path}`);
    });

  git
    .command("branches")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("List local Git branches")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.git.branches(id, { cwd: options.cwd });
      for (const branch of result.branches) console.log(branch);
    });

  git
    .command("checkout")
    .argument("<id>", "sandbox id")
    .argument("<ref>", "branch, tag, or commit")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Checkout a Git ref")
    .action(async (id, ref, options) => {
      const client = await apiClient();
      printRun(await client.git.checkout(id, ref, { cwd: options.cwd }));
    });

  git
    .command("branch")
    .argument("<id>", "sandbox id")
    .argument("<name>", "new branch name")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Create and checkout a new Git branch")
    .action(async (id, name, options) => {
      const client = await apiClient();
      printRun(await client.git.createBranch(id, name, { cwd: options.cwd }));
    });

  git
    .command("add")
    .argument("<id>", "sandbox id")
    .argument("[paths...]", "paths to stage")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Stage Git paths")
    .action(async (id, paths, options) => {
      const client = await apiClient();
      printRun(await client.git.add(id, paths.length ? paths : ["."], { cwd: options.cwd }));
    });

  git
    .command("commit")
    .argument("<id>", "sandbox id")
    .requiredOption("-m, --message <message>", "commit message")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .option("--all", "stage tracked changes before committing")
    .option("--allow-empty", "allow an empty commit")
    .option("--author-name <name>", "Git user.name for this commit")
    .option("--author-email <email>", "Git user.email for this commit")
    .description("Create a Git commit")
    .action(async (id, options) => {
      const client = await apiClient();
      printRun(await client.git.commit(id, options.message, {
        cwd: options.cwd,
        all: options.all,
        allowEmpty: options.allowEmpty,
        authorName: options.authorName,
        authorEmail: options.authorEmail
      }));
    });

  git
    .command("pull")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .option("--remote <name>", "remote name", "origin")
    .option("--branch <branch>", "branch to pull")
    .option("--rebase", "pull with --rebase")
    .option("--remote-url <url>", "HTTPS remote URL to use with one-shot credentials")
    .option("--token-env <name>", "environment variable containing an HTTPS Git token")
    .option("--username <name>", "HTTPS Git username; defaults to x-access-token for token auth")
    .option("--preserve-credentials", "dangerously leave credentials in the Git remote URL")
    .description("Pull from a Git remote")
    .action(async (id, options) => {
      const client = await apiClient();
      printRun(await client.git.pull(id, {
        cwd: options.cwd,
        remote: options.remote,
        branch: options.branch,
        rebase: options.rebase,
        remoteUrl: options.remoteUrl,
        credentials: gitCredentialsFromOptions(options),
        credentialPersistence: persistenceFromOptions(options)
      }));
    });

  git
    .command("push")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .option("--remote <name>", "remote name", "origin")
    .option("--branch <branch>", "branch to push")
    .option("--set-upstream", "push with --set-upstream")
    .option("--remote-url <url>", "HTTPS remote URL to use with one-shot credentials")
    .option("--token-env <name>", "environment variable containing an HTTPS Git token")
    .option("--username <name>", "HTTPS Git username; defaults to x-access-token for token auth")
    .option("--preserve-credentials", "dangerously leave credentials in the Git remote URL")
    .description("Push to a Git remote")
    .action(async (id, options) => {
      const client = await apiClient();
      printRun(await client.git.push(id, {
        cwd: options.cwd,
        remote: options.remote,
        branch: options.branch,
        setUpstream: options.setUpstream,
        remoteUrl: options.remoteUrl,
        credentials: gitCredentialsFromOptions(options),
        credentialPersistence: persistenceFromOptions(options)
      }));
    });

  git
    .command("remotes")
    .argument("<id>", "sandbox id")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("List Git remotes")
    .action(async (id, options) => {
      const client = await apiClient();
      printRun(await client.git.remotes(id, { cwd: options.cwd }));
    });

  git
    .command("remote-add")
    .argument("<id>", "sandbox id")
    .argument("<name>", "remote name")
    .argument("<url>", "remote URL")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Add a Git remote")
    .action(async (id, name, url, options) => {
      const client = await apiClient();
      printRun(await client.git.remoteAdd(id, name, url, { cwd: options.cwd }));
    });

  git
    .command("config")
    .argument("<id>", "sandbox id")
    .argument("<key>", "Git config key")
    .argument("[value]", "Git config value")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Read or write Git config")
    .action(async (id, key, value, options) => {
      const client = await apiClient();
      printRun(value === undefined
        ? await client.git.getConfig(id, key, { cwd: options.cwd })
        : await client.git.setConfig(id, key, value, { cwd: options.cwd }));
    });

  git
    .command("user")
    .argument("<id>", "sandbox id")
    .requiredOption("--name <name>", "Git user.name")
    .requiredOption("--email <email>", "Git user.email")
    .option("--cwd <path>", "repository path inside the sandbox", "/workspace/project")
    .description("Configure Git user.name and user.email")
    .action(async (id, options) => {
      const client = await apiClient();
      printRun(await client.git.configureUser(id, { name: options.name, email: options.email }, { cwd: options.cwd }));
    });
};

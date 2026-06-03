import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey: process.env.HARAKIRI_API_KEY!
});

const repoUrl = process.env.HARAKIRI_GIT_REPO ?? "https://github.com/octocat/Hello-World.git";
const gitToken = process.env.HARAKIRI_GIT_TOKEN;

const sandbox = await harakiri.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "open-agents-dev",
  ttlSeconds: 900,
  egress: { mode: "restricted", presets: ["llm-apis"] },
  source: {
    type: "git",
    url: repoUrl,
    branch: process.env.HARAKIRI_GIT_BRANCH,
    targetPath: "/workspace/project",
    shallow: true,
    credentials: gitToken ? { type: "token", token: gitToken, username: process.env.HARAKIRI_GIT_USERNAME } : undefined
  }
});

try {
  const status = await sandbox.git.status({ cwd: "/workspace/project" });
  console.log(`branch=${status.branch ?? "-"} clean=${status.clean}`);

  await sandbox.files.write({
    path: "/workspace/project/.harakiri-smoke",
    content: "created from Harakiri SDK git workflow\n"
  });
  await sandbox.git.add([".harakiri-smoke"], { cwd: "/workspace/project" });
  await sandbox.git.configureUser({
    name: "Harakiri SDK",
    email: "sdk@harakiri.local"
  }, { cwd: "/workspace/project" });
  await sandbox.git.commit("harakiri sdk git smoke", {
    cwd: "/workspace/project",
    allowEmpty: false
  });

  const after = await sandbox.git.status({ cwd: "/workspace/project" });
  console.log(`after_commit branch=${after.branch ?? "-"} clean=${after.clean}`);
} finally {
  await sandbox.kill();
}

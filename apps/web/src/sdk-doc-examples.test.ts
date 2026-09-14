import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { documentationAssets } from "./docs-export.js";
import { docPages } from "./docs-content.js";
import { docSectionId } from "./docs-navigation.js";
import { publishedSdkExamples, publishedSdkInstall, publishedSdkVersion } from "./sdk-doc-examples.js";

const root = new URL("../../../", import.meta.url);
const repositoryGuides = [
  "examples/README.md", "packages/sdk/README.md", "docs/sdk.md", "docs/errors.md",
  "docs/routes.md", "docs/tutorials.md", "docs/cli.md", "docs/workspaces.md",
  "docs/workspace-reference.md", "docs/persistent-workspaces.md", "docs/persistent-workspace-operations.md"
];

test("complete public programs and exported code use the same tested source", () => {
  const assets = documentationAssets();
  const destinations = {
    quickstart: "quickstart", worker: "hands-on-tutorials", artifacts: "filesystem-artifacts",
    workspace: "persistent-workspaces", "opencode-headless": "opencode-template", "opencode-server": "opencode-template"
  };
  for (const [name, source] of Object.entries(publishedSdkExamples)) {
    assert.ok(assets.get(`docs/${destinations[name as keyof typeof destinations]}.md`)!.includes(source), name);
    assert.doesNotMatch(source, /fromEnv|readBytes|kill\(\{ wait: true/);
    assert.match(source, /capacityPhase === "released"/);
  }
  const worker = readFileSync(new URL("examples/sdk-worker-tutorial/index.mjs", root), "utf8");
  assert.equal(worker.trim(), publishedSdkExamples.worker.trim());
  assert.ok(readFileSync(new URL("docs/tutorials.md", root), "utf8").includes(publishedSdkExamples.worker));
});

test("current install guidance consistently pins the published preview", () => {
  const assets = documentationAssets();
  for (const id of ["quickstart", "sdk-cli", "hands-on-tutorials", "workspace-reference"]) {
    assert.ok(assets.get(`docs/${id}.md`)!.includes(publishedSdkInstall), id);
  }
  for (const page of docPages.filter((page) => page.section !== "Agent demos" && page.id !== "cli-live-preview")) {
    const markdown = assets.get(`docs/${page.id}.md`)!;
    for (const install of markdown.matchAll(/(?:npm install|pnpm add)[^\n]*@h-sandbox\/(?:sdk|cli)([^\s\n]*)/g)) {
      assert.equal(install[1], "@" + publishedSdkVersion, `${page.id}: ${install[0]}`);
    }
  }
  const candidate = assets.get("docs/typescript-sdk.md")!;
  assert.match(candidate, /Unreleased SDK candidate/);
  assert.match(candidate, /not in the published/);
  assert.ok(assets.get("docs/errors-troubleshooting.md")!.includes("HarakiriSandboxCreationError"));
  assert.ok(!assets.get("docs/template-builds.md")!.includes("HarakiriSandboxCreationError"));
});

test("affected repository guides resolve their local and public documentation links", () => {
  for (const path of repositoryGuides) {
    const file = new URL(path, root);
    const text = readFileSync(file, "utf8");
    for (const [, href] of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (href.startsWith("https://sb.harakiri.io/#docs/")) {
        const [id, query] = href.split("#docs/")[1].split("?");
        const page = docPages.find((item) => item.id === id);
        assert.ok(page, `${path}: ${href}`);
        const section = new URLSearchParams(query).get("section");
        if (section) assert.ok(page.toc.map(docSectionId).includes(section), `${path}: ${href}`);
      } else if (!/^(?:[a-z]+:|#|\/)/.test(href)) {
        assert.ok(existsSync(new URL(href.split(/[?#]/)[0], file)), `${path}: ${href}`);
      }
    }
    assert.doesNotMatch(text, /HarakiriCommandExecutionError|HarakiriConfigurationError|HarakiriArtifactIntegrityError/);
  }
});

test("displayed OpenCode CLI health check uses both auth layers and cleans up on failure", () => {
  const markdown = documentationAssets().get("docs/opencode-template.md")!;
  const code = [...markdown.matchAll(/```bash\n([\s\S]*?)\n```/g)]
    .map((match) => match[1]).find((source) => source.includes("rc.10 expose --wait"))!;
  assert.ok(code);
  execFileSync("bash", ["-n"], { input: code });
  // No real CLI, API, or credentials: verify the exact shell program's arguments.
  const harness = String.raw`
openssl() { printf 'fixture-password'; }
harakiri() {
  case "$1" in
    create)
      [[ "$*" == *"--env OPENCODE_SERVER_PASSWORD=$PASSWORD"* ]] || return 91
      printf 'sbx_cli_test\n' ;;
    command)
      [[ "$*" == *'--cmd opencode serve --hostname 0.0.0.0 --port 4096'* ]] || return 92 ;;
    expose)
      [[ "$*" != *'--wait'* ]] || return 93
      printf '{"route":{"url":"https://route.example.test"},"accessHeaderName":"x-harakiri-route-token","accessToken":"route-token"}\n' ;;
    kill)
      [[ "$2" == sbx_cli_test ]] || return 94
      printf 'cleanup %s\n' "$2" ;;
    *) return 95 ;;
  esac
}
curl() {
  [[ "$*" == *"--user opencode:$PASSWORD"* ]] || return 96
  [[ "$*" == *'-H x-harakiri-route-token: route-token'* ]] || return 97
  [[ "$*" == *'https://route.example.test/global/health'* ]] || return 98
  if [[ "$HEALTH_FAILURE" == 1 ]]; then return 22; fi
  printf '{"healthy":true}\n'
}
eval "$1"`;
  const output = execFileSync("bash", ["-c", harness, "--", code], { encoding: "utf8", env: { PATH: process.env.PATH, HEALTH_FAILURE: "0" } });
  assert.match(output, /true\ncleanup sbx_cli_test/);
  assert.throws(() => execFileSync("bash", ["-c", harness, "--", code], { encoding: "utf8", env: { PATH: process.env.PATH, HEALTH_FAILURE: "1" } }), (error: unknown) => {
    const failure = error as { status: number; stdout: string };
    assert.notEqual(failure.status, 0);
    assert.match(failure.stdout, /cleanup sbx_cli_test/);
    assert.doesNotMatch(failure.stdout, /true/);
    return true;
  });
});

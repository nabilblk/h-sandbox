import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";
import { execFileSync } from "node:child_process";
import { workspaceStates } from "./workspace-docs.js";
import { workspaceOperations } from "./workspace-reference-docs.js";
import { workspaceTutorialSource } from "./workspace-tutorial-docs.js";

test("docs content exposes expected product pages and renderable body markup", () => {
  assert.ok(docPages.length >= 8);
  assert.ok(docPages.some((page) => page.id === "vision-architecture" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "quickstart" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "hands-on-tutorials" && page.section === "Tutorials"));
  assert.ok(docPages.some((page) => page.id === "sdk-cli" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "team-members" && page.section === "Organization"));
  assert.ok(docPages.some((page) => page.id === "sandbox-lifecycle" && page.section === "Sandboxes"));
  assert.ok(docPages.some((page) => page.id === "sandbox-processes" && page.section === "Sandboxes"));
  assert.ok(docPages.some((page) => page.id === "api-reference" && page.section === "Reference"));

  const quickstart = docPages.find((page) => page.id === "quickstart");
  assert.ok(quickstart);
  const markup = renderToStaticMarkup(quickstart.body);
  assert.match(markup, /harakiri create --template python-3\.12-data/);
  assert.match(markup, /harakiri expose sbx_\.\.\. --port 3000/);

  const tutorials = docPages.find((page) => page.id === "hands-on-tutorials");
  assert.ok(tutorials);
  const tutorialsMarkup = renderToStaticMarkup(tutorials.body);
  assert.match(tutorialsMarkup, /tutorial-data-job/);
  assert.match(tutorialsMarkup, /anonymous request returns/);
  assert.match(tutorialsMarkup, /python-package-install/);
  assert.match(tutorialsMarkup, /octocat\/Hello-World\.git/);
  assert.match(tutorialsMarkup, /createFromSnapshot/);
  assert.match(tutorialsMarkup, /idempotencyKey/);
  assert.match(tutorialsMarkup, /trap cleanup EXIT/);
  assert.match(tutorialsMarkup, /Verification/);

  const vision = docPages.find((page) => page.id === "vision-architecture");
  assert.ok(vision);
  const visionMarkup = renderToStaticMarkup(vision.body);
  assert.match(visionMarkup, /Harakiri control plane/);
  assert.match(visionMarkup, /ArchitectureDiagram|Harakiri architecture diagram/);

  const sdkCli = docPages.find((page) => page.id === "sdk-cli");
  assert.ok(sdkCli);
  const sdkCliMarkup = renderToStaticMarkup(sdkCli.body);
  assert.match(sdkCliMarkup, /npm install @h-sandbox\/sdk/);
  assert.match(sdkCliMarkup, /npm install -g @h-sandbox\/cli/);
  assert.match(sdkCliMarkup, /runSandbox/);

  const lifecycle = docPages.find((page) => page.id === "sandbox-lifecycle");
  assert.ok(lifecycle);
  const lifecycleMarkup = renderToStaticMarkup(lifecycle.body);
  assert.match(lifecycleMarkup, /snapshotId/);
  assert.match(lifecycleMarkup, /lifecycleSnapshot/);

  const vault = docPages.find((page) => page.id === "credential-vault");
  assert.ok(vault);
  const vaultMarkup = renderToStaticMarkup(vault.body);
  assert.match(vaultMarkup, /Admins manage reusable sources and organization audit history in Vault/);
  assert.match(vaultMarkup, /new-sandbox flow lists only sources available to the current caller/);
  assert.match(vaultMarkup, /Kubernetes Secret locator/);
  assert.match(vaultMarkup, /externalSecretReferences\.create/);
  assert.match(vaultMarkup, /organization-member use/);
  assert.match(vaultMarkup, /Provider vault state is observed, not assumed/);
  assert.match(vaultMarkup, /PATCH/);
  assert.match(vaultMarkup, /harakiri vault rehydrate/);

  const processes = docPages.find((page) => page.id === "sandbox-processes");
  assert.ok(processes);
  const processesMarkup = renderToStaticMarkup(processes.body);
  assert.match(processesMarkup, /sandbox\.processes\.start/);
  assert.match(processesMarkup, /harakiri command wait/);

  const cli = docPages.find((page) => page.id === "cli-reference");
  assert.ok(cli);
  const cliMarkup = renderToStaticMarkup(cli.body);
  assert.match(cliMarkup, /harakiri file-upload/);
  assert.match(cliMarkup, /harakiri template build/);

  const filesystem = docPages.find((page) => page.id === "filesystem-artifacts");
  assert.ok(filesystem);
  const filesystemMarkup = renderToStaticMarkup(filesystem.body);
  assert.match(filesystemMarkup, /sandbox\.artifacts\.upload/);
  assert.match(filesystemMarkup, /harakiri file-upload/);
  assert.match(filesystemMarkup, /json-base64/);

  const errors = docPages.find((page) => page.id === "errors-troubleshooting");
  assert.ok(errors);
  const errorsMarkup = renderToStaticMarkup(errors.body);
  assert.match(errorsMarkup, /HarakiriProviderUnavailableError/);
  assert.match(errorsMarkup, /sandbox_file_artifact_checksum_mismatch/);
});

test("documentation navigation targets existing pages and section headings", () => {
  const ids = new Set(docPages.map((page) => page.id));
  assert.equal(ids.size, docPages.length);
  for (const page of docPages) {
    const markup = renderToStaticMarkup(page.body);
    for (const heading of page.toc) {
      const target = renderToStaticMarkup(createElement("h2", null, heading));
      assert.ok(markup.includes(target), `${page.id}: missing heading ${heading}`);
    }
    for (const match of markup.matchAll(/href="#docs\/([a-z0-9-]+)"/g)) {
      assert.ok(ids.has(match[1]), `${page.id}: broken page link ${match[1]}`);
    }
  }
});

test("workspaces have separate concept, tutorial, reference and operations pages", () => {
  const expected = [
    ["workspaces", "Concepts"], ["persistent-workspaces", "Tutorials"],
    ["workspace-reference", "Reference"], ["workspace-operations", "Operations"]
  ];
  for (const [id, section] of expected) {
    const page = docPages.find((item) => item.id === id);
    assert.ok(page);
    assert.equal(page.section, section);
    const markup = renderToStaticMarkup(page.body);
    assert.doesNotMatch(markup, /href="https:\/\/github.com\/nabilblk\/h-sandbox/);
    assert.match(markup, /0\.5\.0-rc\.2/);
  }
  const concept = renderToStaticMarkup(docPages.find((page) => page.id === "workspaces")!.body);
  for (const [status] of workspaceStates) assert.ok(concept.includes(status));
  assert.match(concept, /not private to its creator/);
  assert.match(concept, /not a persistent storage resource/);
  assert.match(concept, /no public unarchive/);
  const reference = renderToStaticMarkup(docPages.find((page) => page.id === "workspace-reference")!.body);
  for (const [method, path] of workspaceOperations) assert.ok(reference.includes(`${method} ${path}`));
  assert.match(reference, /storageRequested/);
  assert.match(reference, /--retain-storage/);
});

test("public workspace scenario is complete, syntactically valid and checks one execution", () => {
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: workspaceTutorialSource });
  assert.match(workspaceTutorialSource, /from "@h-sandbox\/sdk"/);
  assert.match(workspaceTutorialSource, /finally/);
  assert.match(workspaceTutorialSource, /await client\.workspaces\.archive/);
  assert.match(workspaceTutorialSource, /assert\.deepEqual\(JSON\.parse\(checkpoint.content\)/);
  assert.match(workspaceTutorialSource, /runs\.txt/);
  assert.match(workspaceTutorialSource, /commands\.stream\(second\.id, command\.id, \{ cursor \}\)/);
  assert.doesNotMatch(workspaceTutorialSource, /job\.py|packages\/sdk\/dist/);
});

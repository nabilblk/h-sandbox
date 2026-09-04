import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";

test("docs content exposes expected product pages and renderable body markup", () => {
  assert.ok(docPages.length >= 8);
  assert.ok(docPages.some((page) => page.id === "vision-architecture" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "quickstart" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "hands-on-tutorials" && page.section === "Tutorials"));
  assert.ok(docPages.some((page) => page.id === "sdk-cli" && page.section === "Getting started"));
  assert.ok(docPages.some((page) => page.id === "team-members" && page.section === "Workspace"));
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

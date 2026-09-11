import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";
import { docGroups, searchDocPages } from "./docs-navigation.js";
import { documentationAssets, renderDocMarkdown } from "./docs-export.js";
import { installationSourceRevision, kubernetesInstallCommands as commands, kubernetesInstallCheck, kubernetesInstallDocs } from "./kubernetes-install-docs.js";

test("operators can find installation from navigation, starting pages and search", () => {
  assert.ok(docGroups.find((group) => group.title === "Self-hosting")?.pages.includes("install-kubernetes"));
  for (const id of ["overview", "developer-preview", "quickstart"]) {
    assert.match(renderToStaticMarkup(docPages.find((page) => page.id === id)!.body), /href="#docs\/install-kubernetes"/);
  }
  for (const query of ["Kubernetes", "k8s", "Helm", "PostgreSQL Keycloak", "install StorageClass"]) {
    assert.ok(searchDocPages(docPages, query).some((page) => page.id === "install-kubernetes"), query);
  }
});

test("installation commands survive Markdown export without changes", () => {
  const assets = documentationAssets();
  const markdown = assets.get("docs/install-kubernetes.md")!;
  for (const code of Object.values(commands)) assert.ok(markdown.includes(code));
  assert.ok(markdown.includes(kubernetesInstallCheck));
  assert.match(markdown, /```bash/);
  assert.match(markdown, /```javascript/);
  assert.match(assets.get("llms.txt")!, /docs\/install-kubernetes.md/);
  assert.match(assets.get("llms-full.txt")!, /PASS: create, file write\/read, command and termination/);
});

test("all shell snippets and the model-free consumer example are syntactically valid", () => {
  for (const code of Object.values(commands)) execFileSync("bash", ["-n"], { input: code });
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: kubernetesInstallCheck });
  assert.match(kubernetesInstallCheck, /from "@h-sandbox\/sdk"/);
  assert.match(kubernetesInstallCheck, /assert.equal\(result.exitCode, 0\)/);
  assert.match(kubernetesInstallCheck, /assert.equal\(file.content, "harakiri-ready"\)/);
  assert.match(kubernetesInstallCheck, /finally\s*\{\s*await sandbox.kill\(\)/);
  assert.ok(kubernetesInstallCheck.lastIndexOf('console.log("PASS:') > kubernetesInstallCheck.indexOf("await sandbox.kill()"));
  assert.doesNotMatch(kubernetesInstallCheck, /opencode run|OPENAI_API_KEY|packages\/sdk\/dist/);
});

test("installation pins reviewed artifacts, separates configuration and protects the target", () => {
  assert.match(installationSourceRevision, /^[a-f0-9]{40}$/);
  assert.ok(commands.source.includes(installationSourceRevision));
  assert.match(commands.cluster, /export KUBECONFIG=/);
  assert.doesNotMatch(commands.configure, /kubectl|helm/);
  assert.match(commands.runtime, /opensandbox-0.2.2-harakiri.2.tgz/);
  assert.match(commands.controlPlane, /harakiri-0.5.0-rc.9.tgz/);
  assert.doesNotMatch(commands.controlPlane, /rc\.8-public-values/);
  const receipt = fs.readFileSync(new URL("../../../docs/release-notes/0.5.0-rc.8-delivery.md", import.meta.url), "utf8");
  const image = commands.template.match(/core\.campus\.clusterdiali\.me\/harakiri\/templates\/opencode@sha256:[a-f0-9]{64}/)![0];
  assert.ok(receipt.includes(image));
  for (const code of [commands.webForward, commands.apiForward, commands.authForward]) assert.match(code, /--address=127.0.0.1/);
  const all = Object.values(commands).join("\n");
  assert.doesNotMatch(all, /OCP-install|background-agents|--from-literal|AUTH_DEV_ALLOW=1|kubectl exec|kubectl delete (?:ns|namespace|crd)/);
});

test("profile limits and upgrade hazards stay visible instead of implying production certification", () => {
  const markdown = renderDocMarkdown(kubernetesInstallDocs);
  for (const phrase of ["Native amd64 acceptance is still pending", "execution slots are enforced", "historical usage is not measured", "NET_ADMIN", "does not fit an unchanged restricted OpenShift SCC", "local-path", "realm-scoped service account", "no application build", "does not contact Kubernetes", "not a complete data erasure", "encrypted Vault rows", "not expected behavior"]) {
    assert.ok(markdown.includes(phrase), phrase);
  }
  const chartReadme = fs.readFileSync(new URL("../../../infra/charts/harakiri/README.md", import.meta.url), "utf8");
  assert.match(chartReadme, /docs\/install-kubernetes.md/);
  assert.doesNotMatch(chartReadme, /--version 0\.1\.0|KEYCLOAK_ADMIN_PASSWORD='CHANGEME'/);
});

test("cold-start evidence and capacity rollback limits are disclosed without promising a new release", () => {
  const markdown = renderDocMarkdown(kubernetesInstallDocs);
  assert.match(markdown, /cold-start readiness race/);
  assert.match(markdown, /Keep the accepted sandbox ID/);
  assert.match(markdown, /blindly retry commands and writes whose outcome is unknown/);
  assert.match(markdown, /execution-capacity-install-acceptance\.md/);
  assert.match(markdown, /not a newly published candidate/);
  assert.match(markdown, /pre-capacity rc\.8 after migration 038/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";
import { docGroups, searchDocPages } from "./docs-navigation.js";
import { documentationAssets, renderDocMarkdown } from "./docs-export.js";
import { openshiftCommands, openshiftInstallDocs } from "./openshift-install-docs.js";

test("OpenShift is discoverable and exported as first-class self-hosting documentation", () => {
  assert.ok(docGroups.find((group) => group.title === "Self-hosting")?.pages.includes("install-openshift"));
  for (const query of ["OpenShift", "SCC", "CRI-O", "private CA", "Helm"]) {
    assert.ok(searchDocPages(docPages, query).some((page) => page.id === "install-openshift"), query);
  }
  const assets = documentationAssets();
  assert.match(assets.get("llms.txt")!, /docs\/install-openshift.md/);
  for (const command of Object.values(openshiftCommands)) {
    assert.ok(assets.get("docs/install-openshift.md")!.includes(command));
    execFileSync("bash", ["-n"], { input: command });
  }
  const html = renderToStaticMarkup(openshiftInstallDocs.body);
  assert.match(html, /data-language="bash"/);
  assert.match(html, /hljs-/);
});

test("operator guide preserves qualification, security and ownership boundaries", () => {
  const markdown = renderDocMarkdown(openshiftInstallDocs).replace(/\\_/g, "_");
  for (const phrase of ["Client-test preview: 0.5.0-rc.15", "Native OpenShift validation is pending", "rc.14 does not include the restriction guard", "NET_ADMIN", "CRI-O", "not a microVM", "One namespace does not mean namespace-only privileges", "Internal service hops remain HTTP", "DNS only", "does not prove", "does not write into the static site", "Image rollback is not schema rollback"]) {
    assert.ok(markdown.includes(phrase), phrase);
  }
  assert.doesNotMatch(markdown, /BackgroundAgent|background-agents|OCP-install|install\.sh|--insecure|--tls-skip|--from-literal|oc exec|oc delete (?:project|namespace|scc)/);
  const runbook = readFileSync(new URL("../../../docs/install-openshift.md", import.meta.url), "utf8");
  for (const command of Object.values(openshiftCommands)) {
    const executableLines = command.split("\n").filter((line) => !line.startsWith("#"));
    for (const line of executableLines) assert.ok(runbook.includes(line.trim()), `Command drift: ${line}`);
  }
});

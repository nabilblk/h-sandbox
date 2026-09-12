import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";
import { docGroups, searchDocPages } from "./docs-navigation.js";
import { documentationAssets, renderDocMarkdown } from "./docs-export.js";
import { recoveryCommands, recoveryDocs } from "./recovery-docs.js";

test("recovery is discoverable after installation and through operator search", () => {
  assert.deepEqual(docGroups.find(group => group.title === "Self-hosting")?.pages.slice(0, 2), ["install-kubernetes", "backup-recovery"]);
  for (const query of ["backup", "wrapping key", "provider interruption", "restore PostgreSQL", "RTO RPO"]) {
    assert.ok(searchDocPages(docPages, query).some(page => page.id === "backup-recovery"), query);
  }
  for (const id of ["install-kubernetes", "overview", "developer-preview", "vision-architecture"]) {
    assert.match(renderToStaticMarkup(docPages.find(page => page.id === id)!.body), /href="#docs\/backup-recovery"/, id);
  }
});

test("public backup commands match the technical runbook and export unchanged", () => {
  const runbook = fs.readFileSync(new URL("../../../docs/operations/standalone-recovery.md", import.meta.url), "utf8");
  const assets = documentationAssets();
  const markdown = assets.get("docs/backup-recovery.md")!;
  for (const command of Object.values(recoveryCommands)) {
    execFileSync("bash", ["-n"], { input: command });
    assert.ok(runbook.includes(command), "Public commands drifted from the technical runbook");
    assert.ok(markdown.includes(command));
    assert.match(command, /--kubeconfig/);
    assert.match(command, /jsonpath='\{\.metadata.uid\}'/);
    assert.doesNotMatch(command, /--insecure|delete namespace|force|CREDENTIAL_VAULT_KEY=/);
  }
  assert.match(recoveryCommands.backup, /umask 077/);
  assert.match(recoveryCommands.restore, /TARGET_CLUSTER_UID" != "\$SOURCE_CLUSTER_UID/);
  assert.match(recoveryCommands.restore, /pg_restore --exit-on-error/);
  assert.match(assets.get("llms.txt")!, /docs\/backup-recovery.md/);
  assert.match(assets.get("llms-full.txt")!, /Four parts of one recovery point/);
});

test("recovery claims require retained evidence and preserve untested boundaries", () => {
  const receipt = JSON.parse(fs.readFileSync(new URL("../../../docs/operations/evidence/standalone-34659892741.json", import.meta.url), "utf8"));
  assert.equal(receipt.version, "0.5.0-rc.9");
  assert.equal(receipt.architecture, "amd64");
  assert.equal(receipt.results.length, 7);
  assert.ok(receipt.results.every((result: { status: string }) => result.status === "passed"));
  assert.equal(receipt.cleanup.status, "passed");
  assert.equal(receipt.releaseCompatibility.status, "not_tested");
  const markdown = renderDocMarkdown(recoveryDocs);
  for (const phrase of ["not encrypted", "different cluster UID", "Unreachable is not absent", "cross-release/schema rollback remains untested", "pre-capacity rc.8 writers", "not an LLM inference test", "not processes or memory", "no uptime SLA", "does not establish a new compatible application-release pair"]) {
    assert.ok(markdown.includes(phrase), phrase);
  }
});

test("entry points agree on the current candidate without rewriting release history", () => {
  for (const id of ["overview", "quickstart", "vision-architecture", "developer-preview"]) {
    const markdown = renderDocMarkdown(docPages.find(page => page.id === id)!);
    assert.match(markdown, /0\.5\.0-rc\.9/, id);
    assert.doesNotMatch(markdown, /(?:current|recorded) Developer Preview is (?:\*\*)?0\.5\.0-rc\.8/i);
    assert.doesNotMatch(markdown, /@h-sandbox\/(?:sdk|cli)@0\.5\.0-rc\.8/);
    assert.match(markdown, /0\.4\.0/);
  }
});

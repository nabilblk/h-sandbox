import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { documentationAssets } from "./docs-export.js";
import { docGroups } from "./docs-navigation.js";
import { observabilityDocs } from "./observability-docs.js";

test("agent observability is a discoverable concept with explicit candidate boundaries", () => {
  assert.ok(docGroups.some((group) => group.title === "Concepts" && group.pages.includes("agent-observability")));
  const html = renderToStaticMarkup(observabilityDocs.body);
  for (const boundary of [
    "Unreleased source candidate", "off by default", "not the published rc.15 packages",
    "restricted OpenShift", "command context propagation", "remain release gates",
    "not proof of durable storage", "unknown, not zero or success",
    "not a promise of immediate physical erasure", "not hidden model reasoning"
  ]) assert.ok(html.includes(boundary), `Missing qualification boundary: ${boundary}`);
});

test("downloadable observability docs retain typed snippets and safe investigation semantics", () => {
  const markdown = documentationAssets().get("docs/agent-observability.md");
  assert.ok(markdown);
  for (const contract of [
    "```typescript", "```python", "client.agentRuns.create", "client.agent_runs.create",
    'grant.exporterOptions("traces")', 'grant.exporter_options("traces")',
    "runs:content", "410 agent_run_expired", "Custom range", "explicit UTC",
    "hide previously displayed sensitive data", "do not have a history cursor yet",
    "No records, no usage or no errors means unknown"
  ]) assert.ok(markdown.includes(contract), `Missing exported contract: ${contract}`);
});

test("optional recording and external export document ownership and unresolved security gates", () => {
  const markdown = documentationAssets().get("docs/agent-observability.md")!;
  for (const contract of [
    "@h-sandbox/sdk/telemetry", "h-sandbox[telemetry]", "withAgentRun", "async_agent_run",
    "observeRecordedProcess", "observe_recorded_process", "includeOutput: true",
    "five-second budget per stage", "do not renew", "borrowing it does not export it automatically",
    "fail the high/critical dependency audit", "Vector-specific deployment"
  ]) assert.ok(markdown.includes(contract), `Missing optional recording boundary: ${contract}`);
});

test("native agent claims point to completed source evidence without implying a release", () => {
  const receipt = JSON.parse(readFileSync(new URL(
    "../../../docs/operations/evidence/agent-observability-native-agents-2026-11-11.json", import.meta.url
  ), "utf8"));
  assert.equal(receipt.status, "configured_gates_passed");
  assert.equal(receipt.results.length, 15);
  assert.ok(receipt.results.every((gate: { status: string }) => gate.status === "passed"));
  assert.equal(receipt.candidate.published, false);
  assert.deepEqual(receipt.cleanup, { status: "passed", privateMaterialRemoved: true });
  assert.deepEqual(receipt.agents.workflows.map((workflow: { topology: string }) => workflow.topology),
    ["host-agent-sandbox-tools", "agent-inside-sandbox"]);
  const markdown = documentationAssets().get("docs/agent-observability.md")!;
  assert.ok(markdown.includes("https://github.com/nabilblk/h-sandbox/actions/runs/42928816151"));
  assert.ok(markdown.includes("Python/Deep Agents native workflows"));
  assert.ok(markdown.includes("Do not enable this candidate in production"));
});

test("operator token recipe produces a secret accepted by the internal ingress", () => {
  const operator = readFileSync(new URL("../../../docs/operations/agent-observability.md", import.meta.url), "utf8");
  assert.ok(operator.includes("openssl rand -hex 32 | tr -d '\\n' > .private/collector-token"));
  assert.ok(operator.includes("not an arbitrary-UID claim"));
  assert.ok(operator.includes("Revocation does not retract already accepted queue records"));
});

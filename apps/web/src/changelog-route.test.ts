import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangelogRoute } from "./routes/changelog.js";

test("changelog route renders release entries and active public navigation", () => {
  const markup = renderToStaticMarkup(createElement(ChangelogRoute, {
    go: () => undefined,
    profile: null,
    onSignIn: () => undefined,
    onSignOut: () => undefined
  }));

  assert.match(markup, /Changelog/);
  const articles = [...markup.matchAll(/<article class="changelog-entry">([\s\S]*?)<\/article>/g)];
  const preview = articles[0]?.[1];
  assert.ok(preview);
  for (const fact of ["v0.5.0-rc.14", "Protected services and OpenWebUI", "generic application WebSockets", "Open Terminal 0.14.6", "0.1.0rc2", "Migration 040", "stable latest unchanged", "Independent operator acceptance"]) assert.ok(preview.includes(fact), fact);
  const candidate = articles[1]?.[1];
  assert.ok(candidate);
  for (const fact of ["v0.5.0-rc.13 (candidate)", "Sandbox Workbench", "execution readiness", "lazy-loaded xterm.js PTY", "256 KiB", "SHA-256", "16 MiB", "finishReason", "deleted elsewhere", "1,000 entries", "500,000 characters", "503 sandbox_metrics_unavailable", "availableFields", "observedAt", "harakiri doctor", "status --check", "HARAKIRI_WEB_URL", "api-2026-10-02.1", "npm next", "stable latest unchanged at 0.4.0", "no database migration", "Deep Agents 0.1.0-rc.2", "exactly SDK rc.12", "Qualification and delivery status are recorded separately"]) {
    assert.ok(candidate.includes(fact), fact);
  }
  assert.doesNotMatch(candidate, /published on npm|all .*gates passed|native .*passed|deployed to/i);
  assert.match(markup, /Python agents on Harakiri/);
  assert.match(markup, /h-sandbox==0\.1\.0rc1/);
  assert.match(markup, /h-sandbox-deepagents==0\.1\.0rc1/);
  assert.match(markup, /Python Deep Agents 0\.7\.21/);
  assert.match(markup, /independent adoption evidence/);
  assert.match(markup, /api-2026-10-02\.1/);
  assert.match(markup, /Sandbox switching and readable logs/);
  assert.match(markup, /Web maintenance \(rc\.12\)/);
  assert.match(markup, /changes only the web image/);
  assert.match(markup, /Verified native installation and recovery/);
  assert.match(markup, /not a new API, SDK, CLI or chart version/);
  assert.match(markup, /v0\.5\.0-rc\.9/);
  assert.match(markup, /Execution capacity and cold-start readiness/);
  assert.match(markup, /v0\.5\.0-rc\.4/);
  assert.match(markup, /Scoped authorization and owned API keys/);
  assert.match(markup, /v0\.5\.0-rc\.3/);
  assert.match(markup, /Reliable sandbox renewal and terminal keepalive/);
  assert.match(markup, /v0\.5\.0-rc\.2/);
  assert.match(markup, /Persistent workspaces and live command output/);
  assert.match(markup, /Credential Vault and executable tutorials/);
  assert.match(markup, /v0\.4\.0/);
  assert.match(markup, /OpenSandbox-native lifecycle persistence/);
  assert.match(markup, /Watching the World Cup/);
  assert.match(markup, /Summer vacation/);
  assert.match(markup, /SDK\/CLI v0\.3\.1/);
  assert.doesNotMatch(markup, /v0\.4[01]\.[0-9]/);
  assert.match(markup, /class="active"/);
});

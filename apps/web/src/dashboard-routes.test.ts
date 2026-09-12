import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiKeysRoute, apiKeyStatus } from "./routes/api-keys.js";
import type { ApiKeySummary } from "@harakiri/shared";
import { MembersRoute } from "./routes/members.js";
import { SettingsRoute } from "./routes/settings.js";
import { UsageRoute } from "./routes/usage.js";
import { VaultRoute } from "./routes/vault.js";

test("small dashboard routes render without dashboard shell coupling", () => {
  const usage = renderToStaticMarkup(createElement(UsageRoute));
  const keys = renderToStaticMarkup(createElement(ApiKeysRoute));
  const members = renderToStaticMarkup(createElement(MembersRoute));
  const settings = renderToStaticMarkup(createElement(SettingsRoute));
  const vault = renderToStaticMarkup(createElement(VaultRoute));

  assert.match(usage, /Usage/);
  assert.match(usage, /Execution slots/);
  assert.match(usage, /Historical activity/);
  assert.match(keys, /API keys/);
  assert.match(keys, /Create key/);
  assert.match(members, /Members/);
  assert.match(members, /Invite member/);
  assert.match(settings, /Settings/);
  assert.match(settings, /Workspace controls and sandbox defaults/);
  assert.match(settings, /Outbound access/);
  assert.match(settings, /Selected destinations/);
  assert.match(vault, /Vault/);
  assert.match(vault, /Reusable credential sources/);
  assert.match(vault, /External references/);
  assert.match(vault, /Audit history/);
  assert.match(vault, /New secret/);
});

test("settings fail closed before capabilities load and keys distinguish expired from revoked", () => {
  const member = renderToStaticMarkup(createElement(SettingsRoute, { canManage: false }));
  assert.match(member, /fieldset[^>]*disabled/);
  assert.doesNotMatch(member, />Save<\/button>/);
  const admin = renderToStaticMarkup(createElement(SettingsRoute, { canManage: true }));
  assert.match(admin, />Save<\/button>/);
  const key = { revokedAt: null, expiresAt: null } as ApiKeySummary;
  assert.equal(apiKeyStatus(key), "Active");
  assert.equal(apiKeyStatus({ ...key, expiresAt: new Date(0).toISOString() }), "Expired");
  assert.equal(apiKeyStatus({ ...key, revokedAt: new Date().toISOString() }), "Revoked");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiKeysRoute } from "./routes/api-keys.js";
import { MembersRoute } from "./routes/members.js";
import { SettingsRoute } from "./routes/settings.js";
import { UsageRoute } from "./routes/usage.js";

test("small dashboard routes render without dashboard shell coupling", () => {
  const usage = renderToStaticMarkup(createElement(UsageRoute));
  const keys = renderToStaticMarkup(createElement(ApiKeysRoute));
  const members = renderToStaticMarkup(createElement(MembersRoute));
  const settings = renderToStaticMarkup(createElement(SettingsRoute));

  assert.match(usage, /Usage/);
  assert.match(usage, /Concurrent sandboxes/);
  assert.match(keys, /API keys/);
  assert.match(keys, /Create key/);
  assert.match(members, /Members/);
  assert.match(members, /Invite member/);
  assert.match(settings, /Settings/);
  assert.match(settings, /Workspace controls and sandbox defaults/);
  assert.match(settings, /Outbound access/);
});

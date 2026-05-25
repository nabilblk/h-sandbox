import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiKeysRoute } from "./routes/api-keys.js";
import { SettingsRoute } from "./routes/settings.js";
import { UsageRoute } from "./routes/usage.js";

test("small dashboard routes render without dashboard shell coupling", () => {
  const usage = renderToStaticMarkup(createElement(UsageRoute));
  const keys = renderToStaticMarkup(createElement(ApiKeysRoute));
  const settings = renderToStaticMarkup(createElement(SettingsRoute));

  assert.match(usage, /Usage/);
  assert.match(usage, /Concurrent sandboxes/);
  assert.match(keys, /API keys/);
  assert.match(keys, /Create key/);
  assert.match(settings, /Settings/);
  assert.match(settings, /Org-wide controls/);
});

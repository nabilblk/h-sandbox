import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SandboxDetailRoute } from "./routes/sandbox-detail.js";

test("sandbox detail route renders its loading shell before runtime data arrives", () => {
  const markup = renderToStaticMarkup(createElement(SandboxDetailRoute, { id: "sbx_test", go: () => undefined }));

  assert.match(markup, /Loading/);
  assert.match(markup, /aria-label="Sandbox navigation"/);
  assert.match(markup, /All sandboxes/);
  assert.match(markup, /aria-label="Recent sandboxes"/);
});

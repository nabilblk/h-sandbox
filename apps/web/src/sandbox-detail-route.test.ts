import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SandboxDetailRoute } from "./routes/sandbox-detail.js";

test("sandbox detail route renders its loading shell before runtime data arrives", () => {
  const markup = renderToStaticMarkup(createElement(SandboxDetailRoute, { id: "sbx_test", go: () => undefined }));

  assert.match(markup, /Loading/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatesRoute } from "./routes/templates.js";

test("templates route renders list and build surfaces before API data arrives", () => {
  const markup = renderToStaticMarkup(createElement(TemplatesRoute, { openSandbox: () => undefined }));

  assert.match(markup, /Templates/);
  assert.match(markup, /List/);
  assert.match(markup, /Builds/);
  assert.match(markup, /New template/);
});

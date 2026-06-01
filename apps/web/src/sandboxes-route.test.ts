import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SandboxesRoute } from "./routes/sandboxes.js";

test("sandboxes route renders the dashboard list shell before API data arrives", () => {
  const markup = renderToStaticMarkup(createElement(SandboxesRoute, { openSandbox: () => undefined }));

  assert.match(markup, /Sandboxes/);
  assert.match(markup, /No running sandboxes/);
  assert.match(markup, /New sandbox/);
  assert.match(markup, /All templates/);
});

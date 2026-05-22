import assert from "node:assert/strict";
import test from "node:test";
import { TEMPLATES, apiPath } from "./index.js";

test("templates include the required Python data template", () => {
  assert.ok(TEMPLATES.some((template) => template.id === "python-3.12-data"));
});

test("apiPath normalizes v1 paths", () => {
  assert.equal(apiPath("sandboxes"), "/v1/sandboxes");
  assert.equal(apiPath("/templates"), "/v1/templates");
});


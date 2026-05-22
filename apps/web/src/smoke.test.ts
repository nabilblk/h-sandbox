import assert from "node:assert/strict";
import test from "node:test";

test("web test harness is active", () => {
  assert.equal(typeof "harakiri", "string");
});

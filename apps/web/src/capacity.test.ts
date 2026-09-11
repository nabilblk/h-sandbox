import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacitySummary, changedSettings, createIntentKeys } from "./capacity.js";
import { defaultWorkspace } from "./workspace.js";

test("intent keys persist for retries, change with input and clear after success", () => {
  const keys = createIntentKeys();
  const first = keys.forIntent({ template: "python", env: { PROJECT: "one" } });
  assert.equal(keys.forIntent({ template: "python", env: { PROJECT: "one" } }), first);
  const second = keys.forIntent({ template: "python", env: { PROJECT: "two" } });
  assert.notEqual(second, first);
  keys.clear();
  assert.notEqual(keys.forIntent({ template: "python", env: { PROJECT: "two" } }), second);
});

test("settings patches never carry unedited limits or read-only fields", () => {
  const baseline = { ...defaultWorkspace(null), capacityRevision: 7 };
  assert.deepEqual(changedSettings(baseline, baseline), {});
  assert.deepEqual(changedSettings({ ...baseline, name: "New name" }, baseline), { name: "New name" });
  assert.deepEqual(changedSettings({ ...baseline, maxConcurrency: 3 }, baseline), { maxConcurrency: 3, expectedCapacityRevision: 7 });
});

test("unavailable capacity is not rendered as zero; stale observations remain visible", () => {
  const state = { capacity: null, error: "Capacity reporting unavailable", loading: false, refresh: async () => {} };
  const unknown = renderToStaticMarkup(createElement(CapacitySummary, { state }));
  assert.match(unknown, /Unknown/);
  assert.doesNotMatch(unknown, /0 \/|0 available/);
  const stale = renderToStaticMarkup(createElement(CapacitySummary, { state: { ...state, capacity: {
    state: "enforced", limit: 2, revision: 1, inUse: 2, available: 0, overLimit: 0,
    breakdown: { active: 0, reserved: 0, releasing: 1, uncertain: 1 }, observedAt: new Date().toISOString()
  } } }));
  assert.match(stale, /2 \/ 2/);
  assert.match(stale, /Last observation/);
  assert.match(stale, /uncertain/);
  assert.doesNotMatch(stale, /adjust the limit/);
});

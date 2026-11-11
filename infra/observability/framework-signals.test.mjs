import assert from "node:assert/strict";
import test from "node:test";
import { frameworkSnapshotReady } from "./framework-signals.mjs";

test("framework visibility waits for model/tool indexing, not just the root", () => {
  const span = (kind, name = kind) => ({ name, attributes: { "openinference.span.kind": kind } });
  const root = span("AGENT", "expected-root");
  const records = [root, span("LLM"), span("TOOL"), span("LLM")];
  for (let length = 0; length < records.length; length++) {
    assert.equal(frameworkSnapshotReady({ partial: false, records: records.slice(0, length) }, root.name), false);
  }
  assert.equal(frameworkSnapshotReady({ partial: true, records }, root.name), false);
  assert.equal(frameworkSnapshotReady({ partial: false, records }, "other-root"), false);
  assert.equal(frameworkSnapshotReady({ partial: false, records }, root.name), true);
  assert.equal(frameworkSnapshotReady({ partial: false, records: records.toReversed() }, root.name), true);
  assert.equal(frameworkSnapshotReady({ partial: false, records: [...records, span("LLM")] }, root.name), false);
});

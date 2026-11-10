import assert from "node:assert/strict";
import test from "node:test";
import { withModel, pinnedModel } from "./model.mjs";

test("real-model acceptance refuses ambient cluster access before any side effect", async () => {
  const denied = new Error("Unowned cluster");
  const forbidden = () => assert.fail("Must not run inference");
  await assert.rejects(withModel({ guard() { throw denied; } }, forbidden, forbidden), error => error === denied);
});

test("inference has immutable image and model identities", () => {
  assert.match(pinnedModel.image, /^ollama\/ollama:[^@]+@sha256:[a-f0-9]{64}$/);
  assert.match(pinnedModel.digest, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(pinnedModel));
});

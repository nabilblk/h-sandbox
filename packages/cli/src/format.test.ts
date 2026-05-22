import assert from "node:assert/strict";
import test from "node:test";
import { hankoStamp, initBanner, progressLine, runtimeLine } from "./format.js";

test("progressLine matches the CLI terminal tone", () => {
  assert.equal(progressLine("sandbox terminated. disk zeroed."), "-> sandbox terminated. disk zeroed.");
});

test("runtimeLine formats seconds with two decimals", () => {
  assert.equal(runtimeLine(3410), "ok runtime=3.41s");
});

test("hankoStamp renders the crimson terminal mark without color for pipes", () => {
  assert.equal(hankoStamp(false), "h.");
});

test("initBanner matches the terminal banner copy", () => {
  assert.equal(initBanner(false), "h.\n\n$ harakiri init\n-> ok. sealed. ready.\n$");
});

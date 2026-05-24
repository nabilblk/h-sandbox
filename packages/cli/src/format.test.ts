import assert from "node:assert/strict";
import test from "node:test";
import { durationLine, hankoStamp, initBanner, progressLine, runtimeLine, templateBuildLogLine, templateBuildSuccessLines } from "./format.js";

test("progressLine matches the CLI terminal tone", () => {
  assert.equal(progressLine("sandbox terminated. disk zeroed."), "-> sandbox terminated. disk zeroed.");
});

test("runtimeLine formats seconds with two decimals", () => {
  assert.equal(runtimeLine(3410), "ok runtime=3.41s");
});

test("durationLine formats seconds with two decimals", () => {
  assert.equal(durationLine(12650), "12.65s");
});

test("templateBuildLogLine keeps stdout quiet and highlights stderr", () => {
  assert.equal(templateBuildLogLine("stdout", "pushed layer"), "   pushed layer");
  assert.equal(templateBuildLogLine("stderr", "pull failed"), "!! pull failed");
});

test("templateBuildSuccessLines include version, digest, duration, and next command", () => {
  assert.deepEqual(
    templateBuildSuccessLines({
      buildId: "bld_123",
      templateId: "open-agents-dev",
      templateVersionId: "tplv_123",
      imageDigest: "sha256:abc",
      durationMs: 3410
    }),
    [
      "success. build=bld_123",
      "version=tplv_123",
      "image=sha256:abc",
      "duration=3.41s",
      "next: harakiri create --template open-agents-dev --name sandbox"
    ]
  );
});

test("hankoStamp renders the crimson terminal mark without color for pipes", () => {
  assert.equal(hankoStamp(false), "h.");
});

test("initBanner matches the terminal banner copy", () => {
  assert.equal(initBanner(false), "h.\n\n$ harakiri init\n-> ok. sealed. ready.\n$");
});

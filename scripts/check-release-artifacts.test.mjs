import assert from "node:assert/strict";
import test from "node:test";
import { assertUnpublished } from "./check-release-artifacts.mjs";

test("release absence checks fail closed and include the chart", async () => {
  const input = { registry: "registry.example.com", project: "sandbox", version: "0.5.0-rc.5", component: "all" };
  const urls = [];
  await assertUnpublished(input, async url => { urls.push(url); return new Response(null, { status: 404 }); });
  assert.equal(urls.length, 3);
  assert.ok(urls[2].includes("charts%252Fharakiri"));
  for (const status of [200, 401, 403, 429, 500]) {
    await assert.rejects(assertUnpublished(input, async () => new Response(null, { status })));
  }
  await assert.rejects(assertUnpublished(input, async () => { throw Error("network error"); }));
  let lookups = 0;
  await assert.rejects(assertUnpublished(input, async () => new Response(null, { status: ++lookups === 2 ? 200 : 404 })));
  assert.equal(lookups, 2, "a partially published bundle must stop, not fill or overwrite the remaining coordinates");
});

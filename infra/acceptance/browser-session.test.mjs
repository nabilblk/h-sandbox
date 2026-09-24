import assert from "node:assert/strict";
import test from "node:test";
import { freshOperatorBearer, operatorTokenIsFresh } from "./browser.mjs";

const now = 1_800_000_000_000;
const bearer = exp => `Bearer header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;

test("operator token freshness is a conservative expiry hint, not JWT verification", () => {
  assert.equal(operatorTokenIsFresh(bearer(now / 1000 + 61), now), true);
  for (const value of ["", "Bearer invalid", "Bearer a.!.c", "Basic abc",
    bearer(now / 1000), bearer(now / 1000 + 60), bearer("private"), bearer(null)]) {
    assert.equal(operatorTokenIsFresh(value, now), false);
  }
});

test("fresh browser credentials do not trigger another login", async () => {
  const token = bearer(now / 1000 + 300);
  assert.equal(await freshOperatorBearer(() => token, () => assert.fail("Unexpected renewal"), () => now), token);
});

test("expired captured credentials renew once before returning authorization", async () => {
  let token = bearer(now / 1000 - 1);
  let renewals = 0;
  const renewed = bearer(now / 1000 + 300);
  assert.equal(await freshOperatorBearer(() => token, async () => {
    renewals++;
    token = renewed;
  }, () => now), renewed);
  assert.equal(renewals, 1);
});

test("failed renewal stops before a caller can submit a mutation", async () => {
  const token = bearer(now / 1000 - 1);
  let renewals = 0;
  await assert.rejects(freshOperatorBearer(() => token, async () => { renewals++; }, () => now), /did not renew/);
  assert.equal(renewals, 1);
  const cause = new Error("browser unavailable");
  await assert.rejects(freshOperatorBearer(() => token, async () => { throw cause; }, () => now), error => error === cause);
  await assert.rejects(freshOperatorBearer(() => "", () => assert.fail("No implicit login"), () => now), /not authenticated/);
});

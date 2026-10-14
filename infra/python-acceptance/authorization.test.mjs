import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { foreignPrincipal, revokeForeignPrincipal } from "./authorization.mjs";

test("foreign fixture is guarded, expiring and never stores the plaintext token", () => {
  let guarded = false, sql;
  const ctx = {
    guard() { guarded = true; },
    k(args, options) {
      assert.equal(guarded, true);
      assert.ok(args.includes("deployment/preview-postgres"));
      sql = options.input;
      return "";
    }
  };
  const principal = foreignPrincipal(ctx);
  assert.match(principal.token, /^hk_test_[A-Za-z0-9_-]+$/);
  assert.ok(sql.includes(createHash("sha256").update(principal.token).digest("hex")));
  assert.ok(!sql.includes(principal.token));
  assert.match(sql, /interval '1 hour', false/);
  assert.match(sql, /'member'/);
  assert.match(sql, /^BEGIN;[\s\S]*COMMIT;$/);
  revokeForeignPrincipal(ctx, principal.id);
  assert.match(sql, /^UPDATE api_keys SET revoked_at/);
  assert.throws(() => revokeForeignPrincipal(ctx, "untrusted'"), /Invalid owned object identifier/);
});

test("foreign fixture cannot reach the database when ownership fails", () => {
  let touched = false;
  assert.throws(() => foreignPrincipal({
    guard() { throw new Error("not owned"); },
    k() { touched = true; }
  }), /not owned/);
  assert.equal(touched, false);
});

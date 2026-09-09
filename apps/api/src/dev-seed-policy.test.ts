import assert from "node:assert/strict";
import test from "node:test";
import { assertDevelopmentSeedAllowed } from "./dev-seed-policy.js";

test("seed requires explicit development settings before migrations or identity writes", () => {
  assert.doesNotThrow(() => assertDevelopmentSeedAllowed({ runtimeProvider: "dev", authDevAllow: true }));
  for (const runtimeProvider of ["opensandbox", "", "dev"]) {
    for (const authDevAllow of [true, false]) {
      for (const nodeEnv of ["production", "development"]) {
        if (runtimeProvider === "dev" && authDevAllow && nodeEnv !== "production") continue;
        assert.throws(() => assertDevelopmentSeedAllowed({ runtimeProvider, authDevAllow, nodeEnv }), /Never seed a shared or public installation/);
      }
    }
  }
});

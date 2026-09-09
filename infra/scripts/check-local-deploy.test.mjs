import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalDeploy } from "./check-local-deploy.mjs";

test("seeded development deployment refuses a public existing or requested origin", () => {
  assertLocalDeploy(["", "http://127.0.0.1:15173", "https://localhost:3000", "http://[::1]:3000"]);
  for (const value of ["https://sb.harakiri.io", "http://192.168.1.2", "https://localhost.example.com", "file:///tmp/example", "not-a-url"]) {
    assert.throws(() => assertLocalDeploy(["http://localhost:15173", value]));
  }
});

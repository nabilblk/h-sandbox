import assert from "node:assert/strict";
import test from "node:test";
import { buildConcurrencyLimitExceeded, templateResourceLimitViolations } from "./template-policy.js";

test("templateResourceLimitViolations returns every exceeded resource field", () => {
  assert.deepEqual(
    templateResourceLimitViolations(
      {
        cpuCount: 10,
        memoryMb: 65536,
        defaultPorts: [3000, 5173, 8000]
      },
      {
        maxCpuCount: 8,
        maxMemoryMb: 32768,
        maxDefaultPorts: 2
      }
    ),
    [
      {
        field: "cpuCount",
        limit: 8,
        actual: 10,
        message: "cpuCount must be less than or equal to 8"
      },
      {
        field: "memoryMb",
        limit: 32768,
        actual: 65536,
        message: "memoryMb must be less than or equal to 32768"
      },
      {
        field: "defaultPorts",
        limit: 2,
        actual: 3,
        message: "defaultPorts must include at most 2 ports"
      }
    ]
  );
});

test("templateResourceLimitViolations allows resources at the limit", () => {
  assert.deepEqual(
    templateResourceLimitViolations(
      { cpuCount: 8, memoryMb: 32768, defaultPorts: [3000, 5173] },
      { maxCpuCount: 8, maxMemoryMb: 32768, maxDefaultPorts: 2 }
    ),
    []
  );
});

test("buildConcurrencyLimitExceeded blocks at and above the configured limit", () => {
  assert.equal(buildConcurrencyLimitExceeded(2, 3), false);
  assert.equal(buildConcurrencyLimitExceeded(3, 3), true);
  assert.equal(buildConcurrencyLimitExceeded(4, 3), true);
});

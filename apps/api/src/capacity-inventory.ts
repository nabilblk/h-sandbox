import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { closeDb } from "./db.js";
import { runtimeProvider } from "./providers/runtime/index.js";
import { reconcileCapacityInventory } from "./services/capacity-inventory.js";

const main = async () => {
  const { values } = parseArgs({ options: {
    organization: { type: "string" }, apply: { type: "boolean", default: false },
    "writers-stopped": { type: "boolean", default: false }, recovery: { type: "boolean", default: false },
    "absence-evidence": { type: "string" }
  } });
  const organizationId = z.uuid().parse(values.organization);
  const absenceEvidence = values["absence-evidence"]
    ? z.record(z.string().min(1), z.string().trim().min(20).max(2000)).parse(JSON.parse(await readFile(values["absence-evidence"], "utf8")))
    : undefined;
  const report = await reconcileCapacityInventory({
    organizationId, apply: values.apply, writersStopped: values["writers-stopped"], recovery: values.recovery, absenceEvidence
  }, { runtimeProvider });
  console.log(JSON.stringify(report, null, 2));
  if (report.unresolved || (values.apply && report.capacity.state !== "enforced")) process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Capacity inventory failed");
  process.exitCode = 1;
}).finally(closeDb);

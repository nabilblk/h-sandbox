import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { HarakiriTelemetryGrant, type TelemetryGrantResponse } from "@h-sandbox/sdk";
import { createRunTelemetry } from "@h-sandbox/sdk/telemetry";
import { orders, runOrdersAgent } from "./orders-agent.js";
import { localModel } from "./local-model.js";

const execute = promisify(execFile);
const config = JSON.parse(await readFile(".telemetry-agent.json", "utf8")) as {
  apiUrl: string; modelUrl: string; model: string; grant: TelemetryGrantResponse;
};
const telemetry = createRunTelemetry(new HarakiriTelemetryGrant(config.grant, config.apiUrl));
try {
  await writeFile("orders.json", JSON.stringify(orders));
  const result = await runOrdersAgent({ model: localModel(config.modelUrl, config.model), telemetry,
    readOrders: () => readFile("orders.json", "utf8"),
    submitReport: async (report) => {
      await writeFile("report.json", JSON.stringify(report));
      const { stdout } = await execute("python3", ["verify-orders.py"], { timeout: 10_000, maxBuffer: 8192 });
      telemetry.logger.emit({ severityNumber: 9, severityText: "INFO", body: stdout });
      return stdout;
    }
  });
  await writeFile("agent-result.json", JSON.stringify(result), { mode: 0o600 });
} finally {
  try { await telemetry.forceFlush(); } finally { await telemetry.shutdown(); }
}

import type { Transaction } from "../../db.js";
import { config } from "../../config.js";
import { createTelemetryDatabase } from "./database.js";
import { createObservabilityControlStore } from "./control-store.js";
import { createTelemetryIngestion } from "./ingestion.js";
import { createVictoriaTelemetryStore } from "./victoria.js";
import { readObservabilitySettings, type ObservabilitySettings } from "./settings.js";

export function createObservabilityServices(
  transaction?: Transaction,
  settings: ObservabilitySettings | null = readObservabilitySettings()
) {
  if (!settings) return null;
  const { collectorUrl, collectorToken, logsUrl, tracesUrl, ...limits } = settings;
  const owned = transaction ? undefined : createTelemetryDatabase(config.databaseUrl);
  const control = createObservabilityControlStore({ transaction: transaction ?? owned!.transaction, limits });
  const ingestion = createTelemetryIngestion({
    authorizeGrant: control.authorizeGrant, admit: control.admit,
    collectorUrl, collectorToken
  });
  return {
    control, ingestion,
    store: createVictoriaTelemetryStore({ logsUrl, tracesUrl }),
    operatorAllowsContent: settings.allowContent,
    close: async () => { await owned?.close(); }
  };
}
export type ObservabilityServices = NonNullable<ReturnType<typeof createObservabilityServices>>;

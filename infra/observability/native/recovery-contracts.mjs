import { createHash } from "node:crypto";

export const telemetryComponents = Object.freeze(["collector", "logs", "traces"]);
export const recoveryFiles = Object.freeze([
  "harakiri.dump", "keycloak.dump", "collector.tar", "logs.tar", "traces.tar",
  "telemetry-values.json", "secrets.json", "live-telemetry-config.json"
]);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Validate the whole set before any destination is changed. This is not a signature. */
export function verifyRecoverySet(manifest, read, expected) {
  if (manifest?.version !== 1 || manifest.runId !== expected.runId || manifest.source !== expected.source
    || !/^\d+-\d+$/.test(manifest.runId) || !/^[a-f0-9]{40}$/.test(manifest.source)
    || !/^[a-f0-9]{64}$/.test(manifest.tenantMappingSha256)
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.recoveryPoint)
    || !Number.isFinite(Date.parse(manifest.recoveryPoint))
    || !manifest.files || Object.keys(manifest.files).length !== recoveryFiles.length
    || !manifest.volumes || Object.keys(manifest.volumes).length !== telemetryComponents.length) {
    throw new Error("Invalid telemetry recovery set identity");
  }
  for (const name of recoveryFiles) {
    if (!/^[a-f0-9]{64}$/.test(manifest.files[name]) || digest(read(name)) !== manifest.files[name]) {
      throw new Error(`Telemetry recovery checksum mismatch: ${name}`);
    }
  }
  for (const component of telemetryComponents) {
    const claim = manifest.volumes?.[component];
    if (claim?.name !== `state-harakiri-observe-${component}-0`
      || typeof claim.uid !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(claim.uid)) {
      throw new Error("Invalid telemetry recovery volume identity");
    }
  }
}

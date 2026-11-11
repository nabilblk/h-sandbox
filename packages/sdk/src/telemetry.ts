/** Optional Node instrumentation; importing the core SDK does not load this module. */
export { withAgentRun } from "./telemetry/lifecycle.js";
export type { AgentRecording, RecordingOptions, TelemetryDiagnostic, TelemetryRuntime } from "./telemetry/lifecycle.js";
export { createRunTracerProvider } from "./telemetry/providers.js";
export { createRunTelemetry } from "./telemetry/logs.js";
export type { RunTelemetry } from "./telemetry/logs.js";
export { observeRecordedProcess } from "./telemetry/commands.js";
export type { ObserveRecordedProcessOptions } from "./telemetry/commands.js";

import type { SandboxCommandStatus } from "./index.js";

export type SandboxCommandEvent =
  | { type: "output"; commandId: string; cursor: string; stdout: string; stderr: string }
  | { type: "status" | "complete"; commandId: string; cursor: string; status: SandboxCommandStatus; exitCode: number | null }
  | { type: "reconnect"; commandId: string; cursor: string }
  | { type: "error"; commandId: string; cursor: string; code: string; message: string };

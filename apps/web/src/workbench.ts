import type { SandboxLogEntry, SandboxRuntimeMetadata } from "@harakiri/shared";

export const workbenchTabs = ["overview", "terminal", "commands", "files", "logs", "metrics", "network", "vault", "snapshots"] as const;
export type WorkbenchTab = typeof workbenchTabs[number];
export const isWorkbenchTab = (value: string): value is WorkbenchTab => workbenchTabs.some((tab) => tab === value);

export function workbenchLocation(route: string) {
  const [pathname, search = "", extra] = route.split("?");
  if (extra !== undefined || !/^dashboard\/sandboxes\/[^/?]+$/.test(pathname)) return null;
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const command = params.get("command");
  if ([...params.keys()].some((key) => !["tab", "command"].includes(key)) ||
      params.getAll("tab").length > 1 || params.getAll("command").length > 1 ||
      (tab !== null && !isWorkbenchTab(tab)) ||
      (command !== null && (tab !== "commands" || !/^[\w.-]{1,256}$/.test(command)))) return null;
  return { tab: tab as WorkbenchTab | null, command: command ?? undefined };
}

export function workbenchRoute(id: string, tab: WorkbenchTab, command?: string): `dashboard/sandboxes/${string}` {
  const params = new URLSearchParams({ tab });
  if (tab === "commands" && command) params.set("command", command);
  return `dashboard/sandboxes/${encodeURIComponent(id)}?${params}`;
}

export function terminalInput(data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(data.length + 1);
  frame.set(data, 1);
  return frame;
}

export function terminalOutput(frame: Uint8Array): Uint8Array | null {
  if (frame[0] === 1 || frame[0] === 2) return frame.subarray(1);
  if (frame[0] === 3 && frame.length >= 9) return frame.subarray(9);
  return null;
}

export const runtimeAvailable = (runtime: SandboxRuntimeMetadata | undefined, name: string) =>
  runtime?.provider.capabilities.find((capability) => capability.name === name)?.state;

export const errorMessage = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export function filterLogs(logs: SandboxLogEntry[], search: string, source: string, level: string) {
  const query = search.trim().toLowerCase();
  return logs.filter((log) => (!source || (log.source ?? "control-plane") === source) && (!level || log.lvl === level) &&
    (!query || `${log.ts} ${log.source ?? "control-plane"} ${log.lvl} ${log.msg}`.toLowerCase().includes(query)));
}

// Snapshot replacement preserves identical repeated log lines without inventing replay guarantees.
export function boundedLogs(logs: SandboxLogEntry[], maxChars = 500_000, maxRows = 1000) {
  let chars = 0;
  let start = logs.length;
  while (start > 0 && logs.length - start < maxRows) {
    const row = logs[start - 1];
    const size = row.msg.length + row.lvl.length + (row.source?.length ?? 0) + row.ts.length;
    if (chars + size > maxChars) break;
    chars += size;
    start--;
  }
  return { logs: logs.slice(start), omitted: start };
}

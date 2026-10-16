import { check, origins, sha256 } from "../acceptance/context.mjs";

const tabs = new Set(["overview", "terminal", "files", "logs", "metrics", "commands"]);
const endpoints = new Set(["", "readiness", "terminal/attach-ticket", "terminal/attach", "files/upload", "files/download", "logs", "metrics", "commands"]);

export function sandboxPath(id) {
  check(/^sbx_[a-zA-Z0-9_-]+$/.test(id ?? ""), "Invalid owned sandbox identity");
  return `/v1/sandboxes/${id}`;
}

export function apiUrl(id, endpoint = "") {
  check(endpoints.has(endpoint), "Unexpected Workbench fixture endpoint");
  return `${origins.api}${sandboxPath(id)}${endpoint ? `/${endpoint}` : ""}`;
}

export function workbenchUrl(id, tab = "overview") {
  sandboxPath(id);
  check(tabs.has(tab), "Unexpected Workbench tab");
  return `${origins.web}/#dashboard/sandboxes/${id}?tab=${tab}`;
}

export function binaryFixture() {
  const bytes = Buffer.alloc(1024 * 1024);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
  return { name: "workbench.bin", path: "/workspace/workbench.bin", bytes, sha256: sha256(bytes) };
}

export function verifyBytes(bytes, fixture) {
  check(bytes.length === fixture.bytes.length && bytes.equals(fixture.bytes) && sha256(bytes) === fixture.sha256, "Downloaded bytes differ from uploaded fixture");
}

export function ptySize(text, marker) {
  check(["WB_SIZE_A", "WB_SIZE_B"].includes(marker), "Unexpected PTY size marker");
  const matches = [...text.matchAll(new RegExp(`^${marker}:(\\d+) (\\d+)\\s*$`, "gm"))];
  const match = matches.at(-1);
  if (!match) return null;
  const rows = Number(match[1]), cols = Number(match[2]);
  return rows > 0 && cols > 0 && rows < 1000 && cols < 1000 ? { rows, cols } : null;
}

export function assertMetrics(snapshot, now = Date.now()) {
  check(["cpu", "mem"].every(field => snapshot.availableFields?.includes(field)), "Runtime CPU and memory observations missing");
  check(Number.isFinite(snapshot.current?.cpu) && snapshot.current.cpu >= 0 && Number.isFinite(snapshot.current?.mem) && snapshot.current.mem > 0, "Runtime metrics are not measured values");
  const observed = Date.parse(snapshot.observedAt);
  check(Number.isFinite(observed) && observed >= now - 120000 && observed <= now + 30000, "Runtime metric timestamp is missing or stale");
  return observed;
}

export function scopedAttachHeaders(request, id, key) {
  check(request.url() === apiUrl(id, "terminal/attach-ticket") && request.method() === "POST", "Scoped key injection outside owned attach request");
  check(typeof key === "string" && key.length > 0, "Missing scoped key");
  const headers = Object.fromEntries(Object.entries(request.headers()).filter(([name]) => !["authorization", "cookie", "x-api-key"].includes(name.toLowerCase())));
  return { ...headers, "x-api-key": key };
}

export async function probeKey(id, key, expected = 200) {
  const response = await fetch(apiUrl(id), { headers: { "x-api-key": key }, signal: AbortSignal.timeout(10000), redirect: "error" });
  check(response.status === expected, "Scoped key read/revocation probe failed");
  await response.body?.cancel();
}

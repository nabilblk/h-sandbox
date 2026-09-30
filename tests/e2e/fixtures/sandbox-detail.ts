import type { Page } from "@playwright/test";
import type { SandboxStatus } from "../../../packages/shared/src/index.ts";
import { defaultWorkspace } from "../../../apps/web/src/workspace";

export const sandboxFixture = (id: string, name: string, status: SandboxStatus = "running") => ({
  id, name, status, template: "python-3.12", cpu: 2, mem: 128, started: "just now", owner: "UI fixture", cost: 0,
  ttlSeconds: 300, expiresAt: "2026-09-30T13:29:28Z", createdAt: "2026-09-30T13:24:28Z", publicUrl: null,
  runtimeMetadata: {
    workdir: "/workspace", user: "sandbox", shell: "/bin/bash", ports: { default: [], exposed: [] },
    provider: { capabilities: [] }
  }
});

export const logFixtures = [
  { lvl: "info", source: "sandbox", msg: "Runtime ready.", ts: "2026-09-30T13:24:32Z" },
  { lvl: "terminal.attach.started", source: "control-plane", msg: "terminal attached", ts: "2026-09-30T13:24:34Z" },
  { lvl: "credential.attachment.refresh.completed", source: "control-plane", msg: "Credential attachment refreshed.", ts: "2026-09-30T13:24:35Z" },
  { lvl: "warn", source: "runtime-with-an-unusually-long-source-name", msg: `Long path: /workspace/${"nested/".repeat(50)}result.json\nSecond line preserved.`, ts: "2026-09-30T13:24:36Z" },
  { lvl: "event".repeat(16), source: "sandbox", msg: `Unbroken value: ${"0123456789abcdef".repeat(35)}`, ts: "2026-09-30T13:24:37Z" }
];

// No real auth, credentials, runtime actions or cluster requests. The fixtures
// exercise the dashboard's actual routes, API client and responsive layout.
export async function setupSandboxDetail(page: Page) {
  const initial = [
    sandboxFixture("sbx_python", "python-3.12-runner"),
    sandboxFixture("sbx_agent", "agent-research-worker", "idle"),
    sandboxFixture("sbx_previous", "previous-evaluation", "terminated"),
    sandboxFixture("sbx_long", "sandbox-with-a-very-long-unbroken-name-".repeat(4), "paused")
  ];
  const state = {
    sandboxes: initial,
    details: new Map(initial.map((sandbox) => [sandbox.id, sandbox])),
    listStatus: 200,
    listGate: Promise.resolve(),
    detailStatus: new Map<string, number>(),
    detailGates: new Map<string, Promise<void>>(),
    logGates: new Map<string, Promise<void>>(),
    logStatus: 200,
    logs: logFixtures,
    requests: [] as string[]
  };
  await page.route("**/src/auth.ts", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export class AuthSessionExpiredError extends Error {}
    const snapshot = { status: 'authenticated', profile: { email: 'detail@example.test', name: 'UI fixture' } };
    export const auth = { init: async () => snapshot, snapshot: () => snapshot, subscribe: (fn) => { fn(snapshot); return () => {}; },
      getAccessToken: async () => 'sandbox-detail-fixture', isAuthenticated: () => true, profile: () => snapshot.profile,
      clearLocalSession() {}, rememberReturnRoute() {}, consumeReturnRoute: () => null, peekReturnRoute: () => null, signIn() {}, signOut() {} };
  ` }));
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push(`${request.method()} ${path}`);
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "/v1/me") return route.fulfill({ json: {
      organization: defaultWorkspace({ email: "detail@example.test", name: "UI fixture" }),
      membership: { role: "admin" }, capabilities: { canManageCredentialSecrets: false },
      user: { id: "fixture", fullName: "UI fixture", email: "detail@example.test", onboardingCompletedAt: "2026-09-30T00:00:00Z" }
    } });
    if (path === "/v1/org/capacity") return route.fulfill({ json: { capacity: {
      state: "enforced", limit: 200, revision: 1, inUse: 2, available: 198, overLimit: 0,
      breakdown: { active: 2, reserved: 0, releasing: 0, uncertain: 0 }, observedAt: "2026-09-30T13:24:32Z"
    } } });
    if (path === "/v1/sandboxes") {
      await state.listGate;
      return route.fulfill({ status: state.listStatus, json: state.listStatus === 200 ? { sandboxes: state.sandboxes } : { error: "unavailable", message: "Sandbox list temporarily unavailable." } });
    }
    const [, , , id, resource] = path.split("/");
    if (resource === "logs") {
      await state.logGates.get(id);
      return route.fulfill({ status: state.logStatus, json: state.logStatus === 200
        ? { logs: [...state.logs, { lvl: "info", source: "sandbox", msg: `Output from ${id}`, ts: "2026-09-30T13:24:38Z" }] }
        : { error: "unavailable", message: "Logs temporarily unavailable." } });
    }
    if (resource === "commands") return route.fulfill({ json: { commands: [] } });
    if (resource === "terminal") return route.fulfill({ status: 409, json: { error: "fixture_disabled", message: "Terminal disabled in UI fixtures." } });
    if (state.details.has(id)) {
      await state.detailGates.get(id);
      const status = state.detailStatus.get(id) ?? 200;
      return route.fulfill({ status, json: status === 200 ? { sandbox: state.details.get(id) } : { error: "unavailable", message: "Sandbox temporarily unavailable." } });
    }
    return route.fulfill({ status: 404, json: { error: "fixture_missing", message: "Unconfigured UI fixture endpoint." } });
  });
  return state;
}

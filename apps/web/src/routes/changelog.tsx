import type { UserProfile } from "../auth";
import { Icon } from "../components/icon";
import { TopNav } from "../components/top-nav";
import type { GoToRoute } from "./types";

const entries = [
  {
    id: "2026-09-07-v0-5-0-rc-2",
    version: "v0.5.0-rc.2",
    date: "September 7, 2026",
    title: "Persistent workspaces and live command output",
    items: [
      "Added opt-in organization-owned workspaces that retain files at /workspace across sandbox replacement, with exclusive attachment and explicit retained-storage archiving.",
      "Added authenticated command output streams, resumable cursors, SDK async iteration, CLI follow commands, and dashboard workspace and command views. Disconnecting a viewer never reruns or kills a command.",
      "Live release testing caught and fixed CLI progress text contaminating JSON streams and saved configuration overriding environment credentials. Both now have regression coverage.",
      "Verified checkpoint reuse across two native OpenSandbox runtimes and output reconnection without duplicate execution on k0s. Added runnable tutorials, operator recovery procedures, and storage limits.",
      "Added registry-only staged installation tooling, protected template release workflows, and independent supervision for the hosted lab tunnel and origins.",
      "This is a test release candidate, not an OpenShift production certification. Clean restricted OpenShift and full template architecture acceptance remain pending; stable npm latest remains 0.4.0."
    ]
  },
  {
    id: "2026-09-05-agent-demos",
    version: "Website update",
    date: "September 5, 2026",
    title: "Real OpenCode demos across CLI, UI, and SDK",
    items: [
      "Added a dedicated Demos library with four captioned videos: CLI code repair, dashboard app creation, SDK report generation, and agent-written browser tests with real Chromium screenshots.",
      "Added matching tutorials, transcripts, downloadable example source, and verified capture details. The original homepage layout is preserved.",
      "Expanded the SDK demo into a 16-chapter walkthrough with the complete OpenCode prompt and agentCommand, execution boundaries, timeouts, verified report and summary downloads, and cleanup.",
      "Expanded CLI/UI into detailed 14/13-chapter tutorials with complete prompts and commands. The browser-QA workflow independently reruns generated tests and requires a deliberately broken filter to fail an assertion.",
      "Executed each scenario with opencode/mimo-v2.5-free and verified tests, artifacts, preview behavior, zero reported model cost, and sandbox cleanup.",
      "No new npm package or API release is required for this website update. Free-model availability can change."
    ]
  },
  {
    id: "2026-09-04-v0-4-0",
    version: "v0.4.0",
    date: "September 4, 2026",
    title: "Credential Vault and executable tutorials",
    items: [
      "Added write-only credential sources for ephemeral values, encrypted workspace secrets, Kubernetes Secret references, and short-lived GitHub App credentials.",
      "Added provider-scoped runtime injection, rotation, revocation, reconciliation, and sanitized audit events across the API, SDK, CLI, and dashboard.",
      "Added template credential slots and private API profiles without putting real values in sandbox environment variables.",
      "Added six hands-on tutorials and verified every workflow against the public k0s-backed deployment.",
      "Expanded operator, security, integration, and troubleshooting documentation for the Credential Vault release candidate."
    ]
  },
  {
    id: "2026-09-02-oss-rc",
    version: "v0.4.0-rc",
    date: "September 2-3, 2026",
    title: "OpenSandbox-native lifecycle persistence",
    items: [
      "Added pause, resume, snapshot create/list/delete, and restore through OpenSandbox provider APIs.",
      "Added stable Harakiri snapshot IDs while keeping provider identifiers behind the runtime boundary.",
      "Upgraded the validated OpenSandbox stack to the 0.2.x and 1.1.x component generation.",
      "Hardened Helm deployment, hosted OIDC configuration, runtime capability reporting, and SDK/CLI conformance checks."
    ]
  },
  {
    id: "2026-08-break",
    version: "No release",
    date: "August 2026",
    title: "Summer vacation",
    items: [
      "Humans entered low-power mode; sandbox TTLs were the only clocks still counting down.",
      "CI stayed green, laptops stayed closed, and no fictional release notes were generated."
    ]
  },
  {
    id: "2026-07-break",
    version: "No release",
    date: "July 2026",
    title: "Watching the World Cup",
    items: [
      "The roadmap entered spectator mode while live-score refreshes briefly outranked kubectl get pods.",
      "Production remained online; the maintainers debated brackets instead of branching strategies."
    ]
  },
  {
    id: "2026-06-10-oss",
    version: "v0.1.0",
    date: "June 10, 2026",
    title: "First repeatable OSS distribution",
    items: [
      "Published control-plane images and the Helm chart to Harbor from CI.",
      "Made the web image runtime-configurable so hosted API and Keycloak URLs no longer require image rebuilds or post-start file patches.",
      "Added pinned OpenSandbox mirrors and registry-only overlays for disconnected installations.",
      "Fixed Helm OCI authentication for Harbor robot usernames."
    ]
  },
  {
    id: "2026-06-04-integrations",
    version: "SDK/CLI v0.3.1",
    date: "June 2-5, 2026",
    title: "Agent integrations, Git, and OpenCode",
    items: [
      "Added the high-level HarakiriSandbox SDK object and OpenAPI-shaped runtime helpers.",
      "Added Git clone, status, branch, add, commit, source provenance, audit metadata, and credential redaction across SDK and CLI.",
      "Added the OpenCode template, headless and server examples, route helpers, and a live free-model verification.",
      "Published the public architecture page and preserved hosted URLs during k0s deployment."
    ]
  },
  {
    id: "2026-06-01-npm",
    version: "npm v0.1.0",
    date: "June 1, 2026",
    title: "Public SDK and CLI packages",
    items: [
      "Published @h-sandbox/sdk and @h-sandbox/cli under the h-sandbox npm organization.",
      "Added package installation, local consumer, publish, and post-publish verification workflows.",
      "Added public SDK, CLI, route, filesystem, process, and error-handling documentation."
    ]
  },
  {
    id: "2026-05-prototype",
    version: "Prototype",
    date: "May 23-26, 2026",
    title: "The first working control plane",
    items: [
      "Built the Keycloak-authenticated dashboard, organization membership, API keys, scheduling, usage, and PostgreSQL-backed control-plane state.",
      "Added OpenSandbox-backed commands, filesystem, logs, metrics, port routes, and developer-friendly outbound access policies.",
      "Added the template catalog, Dockerfile and image builds, immutable versions, aliases, retention, policy checks, and the Open Agents pilot.",
      "Deployed and tested the complete stack on k0s through the public harakiri.io endpoints."
    ]
  }
];

export const ChangelogRoute = ({ go, profile, onSignIn, onSignOut, authStatus }: { go: GoToRoute; profile?: UserProfile | null; onSignIn: () => void; onSignOut: () => void; authStatus?: string }) => (
  <div className="app">
    <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} authStatus={authStatus} active="changelog" />
    <main className="changelog">
      <div className="changelog-head">
        <span className="changelog-kicker"><Icon name="logs" size={14} /> Release notes</span>
        <h1>Changelog</h1>
        <p>Verified product changes from the repository and release artifacts. Months without a release are recorded as pauses, not padded with placeholder features.</p>
      </div>
      <div className="changelog-list">
        {entries.map((entry) => (
          <article className="changelog-entry" key={entry.id}>
            <div className="changelog-meta"><span className="num">{entry.version}</span><span>{entry.date}</span></div>
            <div>
              <h2>{entry.title}</h2>
              <ul>{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </article>
        ))}
      </div>
    </main>
  </div>
);

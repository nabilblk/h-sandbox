import type { UserProfile } from "../auth";
import { Icon } from "../components/icon";
import { TopNav } from "../components/top-nav";
import type { GoToRoute } from "./types";

const entries = [
  {
    id: "2026-09-09-v0-5-0-rc-6",
    version: "v0.5.0-rc.6",
    date: "September 9, 2026",
    title: "Preview installation and container security follow-up",
    items: [
      "Apply distribution security updates when building API and web runtime images. Remove unused npm and Yarn from the API runtime; publishing now refreshes base images.",
      "Correct the isolated evaluation profile's server and gateway resource requests, leaving room for native OpenCode sandboxes on the documented 16 GiB node.",
      "Keep prior candidate artifacts immutable. SDK, CLI, chart and application versions remain aligned; stable npm latest is unchanged.",
      "This remains a trusted-team developer preview. Container scan findings, installation evidence and remaining launch gates are recorded separately from feature claims."
    ]
  },
  {
    id: "2026-09-09-v0-5-0-rc-5",
    version: "v0.5.0-rc.5",
    date: "September 9, 2026",
    title: "Developer preview documentation and truthful usage",
    items: [
      "Replaced synthetic usage history with explicit availability metadata. The dashboard distinguishes retained record counts from unmeasured historical usage; concurrency remains an unenforced target.",
      "Commands use the runtime working directory, preserve edits, and reset when switching sandboxes. Local seed data is guarded against production and native runtime configurations.",
      "Added generated Markdown and language-complete documentation indexes, a developer preview guide, contributor checks and private reporting policies.",
      "Updated vulnerable dependencies and pinned CI actions. Releases validate trusted-main source, matching package versions, immutable candidate artifacts and prerelease channels before publication.",
      "Added an isolated native Kubernetes evaluation profile with operator-owned credentials, explicit OIDC origins and installation/recovery instructions. This remains a developer preview, not restricted OpenShift certification or a managed-service SLA."
    ]
  },
  {
    id: "2026-09-08-v0-5-0-rc-4",
    version: "v0.5.0-rc.4",
    date: "September 8, 2026",
    title: "Scoped authorization and owned API keys",
    items: [
      "Separated API keys from human identities. Keys now have explicit permissions, creator ownership and expiry; members manage their own keys and admins manage organization keys.",
      "Enforced role and scope checks across protected API routes. Vault, registry and audit administration requires explicit scopes; keys cannot manage members, settings or other keys.",
      "Required the harakiri-api audience in Keycloak access tokens. Operators must configure the audience mapper before applying migration 037 and deploying matching services.",
      "Bound terminal tickets to the real principal and rechecked authorization on active terminals and command-output streams. Revocation disconnects observers without cancelling detached commands.",
      "Added permission and expiry controls, one-time key copying, revocation confirmation and read-only member settings. Expanded public authorization, rotation and operator upgrade documentation.",
      "Included the redesigned docs navigation, architecture diagrams and highlighted examples. Legacy keys retain runtime-only permissions; offline JWT logout remains effective at access-token expiry. This is still a prerelease."
    ]
  },
  {
    id: "2026-09-07-v0-5-0-rc-3",
    version: "v0.5.0-rc.3",
    date: "September 7, 2026",
    title: "Reliable sandbox renewal and terminal keepalive",
    items: [
      "Fixed renewed sandboxes expiring at their original schedule. Renewal, retry workers and expiration now coordinate through one locked deadline and a confirmed native lease.",
      "Commands renew the native lease before execution. Attached terminals keep short-TTL sandboxes alive; failed keepalive closes the connection with an explicit error. Following output alone does not renew TTL.",
      "Added idempotency and concurrent-expiration regression coverage, provider failure recovery, and a live SDK test that waits beyond the original deadline without masking the result with activity.",
      "Kept the 10-second product TTL distinct from OpenSandbox's longer minimum create lease. Provider errors are no longer treated as successful renewal or missing runtimes.",
      "Published first-class workspace concepts, reference and operations guides alongside the runnable tutorial. Operators must stop the old scheduler, apply migration 036, and deploy matching API/scheduler versions.",
      "This remains a prerelease. Restricted OpenShift storage acceptance, full template architecture checks and coherent recovery validation are still open; stable channels are unchanged."
    ]
  },
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

import type { UserProfile } from "../auth";
import { Icon } from "../components/icon";
import { TopNav } from "../components/top-nav";
import type { GoToRoute } from "./types";

const entries = [
  {
    version: "v0.41.2",
    date: "June 2026",
    title: "Developer integration surface",
    items: [
      "Published install and smoke-test documentation for the SDK and CLI.",
      "Added examples for provider adapters, runtime conformance, and custom templates.",
      "Documented the sandbox runtime contract and integration boundaries."
    ]
  },
  {
    version: "v0.41.1",
    date: "May 2026",
    title: "Templates and builds",
    items: [
      "Added template catalog, build records, version metadata, and template detail tabs.",
      "Added Dockerfile/image template creation with retained build diagnostics.",
      "Compressed template row actions into the detail panel for a calmer workspace."
    ]
  },
  {
    version: "v0.41.0",
    date: "May 2026",
    title: "Sandbox networking and policy",
    items: [
      "Added sandbox route records for exposed ports and public endpoint visibility.",
      "Added outbound access presets and policy inspection in sandbox detail.",
      "Improved filesystem, logs, metrics, and network tabs around provider capabilities."
    ]
  },
  {
    version: "v0.40.0",
    date: "May 2026",
    title: "MVP control plane",
    items: [
      "Added Keycloak sign-in, organization membership, API keys, and usage views.",
      "Added PostgreSQL-backed lifecycle records for sandboxes, schedules, and routes.",
      "Added a k0s deploy path with public web, API, and auth entrypoints."
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
        <p>Product updates for the Harakiri Sandbox control plane, runtime integrations, and developer tools.</p>
      </div>
      <div className="changelog-list">
        {entries.map((entry) => (
          <article className="changelog-entry" key={entry.version}>
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

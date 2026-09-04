import { useEffect, useState } from "react";
import type { CurrentAccountResponse } from "@harakiri/shared";
import { api } from "../api";
import type { UserProfile } from "../auth";
import { AccountMenu } from "../components/account-menu";
import { Brand } from "../components/brand";
import { Icon } from "../components/icon";
import { defaultWorkspace } from "../workspace";
import { ApiKeysRoute } from "./api-keys";
import { MembersRoute } from "./members";
import { SandboxesRoute } from "./sandboxes";
import { SettingsRoute } from "./settings";
import { TemplatesRoute } from "./templates";
import type { GoToRoute, Route } from "./types";
import { UsageRoute } from "./usage";
import { VaultRoute } from "./vault";

type DashboardCapabilityNav = Pick<
  CurrentAccountResponse["capabilities"],
  "canManageCredentialSecrets" | "canManageMembers"
>;

export const dashboardNavItems = (capabilities: DashboardCapabilityNav) => [
  ["dashboard/sandboxes", "Sandboxes", "box"],
  ["dashboard/templates", "Templates", "folder"],
  ...(capabilities.canManageCredentialSecrets ? [["dashboard/vault", "Vault", "lock"]] : []),
  ["dashboard/metrics", "Usage", "chart"],
  ["dashboard/keys", "API keys", "key"],
  ...(capabilities.canManageMembers ? [["dashboard/members", "Members", "user"]] : []),
  ["dashboard/settings", "Settings", "settings"]
] as const;

export const DashboardShellRoute = ({
  route,
  go,
  openSandbox,
  profile,
  onSignOut
}: {
  route: Route;
  go: GoToRoute;
  openSandbox: (id: string) => void;
  profile?: UserProfile | null;
  onSignOut: () => void;
}) => {
  const sub = route.split("/")[1] ?? "sandboxes";
  const [account, setAccount] = useState<CurrentAccountResponse | null>(null);
  useEffect(() => { api.me().then(setAccount).catch(() => undefined); }, []);
  const org = account?.organization ?? defaultWorkspace(profile);
  const orgInitial = (org.name || profile?.email || "H").slice(0, 1).toUpperCase();
  const canManageMembers = account?.capabilities.canManageMembers === true;
  const canManageCredentialSecrets = account?.capabilities.canManageCredentialSecrets === true;
  const navItems = dashboardNavItems({ canManageCredentialSecrets, canManageMembers });
  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-side-brand"><button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button></div>
        <div className="org-switcher static"><div className="org-ava">{orgInitial}</div><div style={{ flex: 1 }}><div className="org-name">{org.slug}</div><div className="org-plan">Team - 4 seats</div></div></div>
        <nav className="side-nav">
          {navItems.map(([key, label, icon]) => (
            <a key={key} className={`side-link ${route === key ? "active" : ""}`} onClick={() => go(key as Route)}><Icon name={icon} size={14} /><span>{label}</span></a>
          ))}
        </nav>
        <div className="side-foot"><div className="usage-mini"><div className="usage-mini-h"><span>Status</span><span className="num" style={{ color: "var(--ok)" }}>operational</span></div><div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>v0.41.2 - all systems</div></div></div>
      </aside>
      <main className="dash-main">
        <div className="dash-top"><div className="dash-crumbs"><span style={{ color: "var(--muted)" }}>{org.slug}</span><Icon name="chevron" size={11} /><span style={{ textTransform: "capitalize" }}>{sub}</span></div><div className="dash-top-r"><button className="btn btn-ghost btn-sm" onClick={() => go("docs")} title="Open documentation" aria-label="Open documentation"><Icon name="book" size={13} /></button><AccountMenu compact profile={profile} workspace={org.slug} avatarLabel={orgInitial} onSignOut={onSignOut} /></div></div>
        {sub === "sandboxes" ? <SandboxesRoute openSandbox={openSandbox} /> : null}
        {sub === "templates" ? <TemplatesRoute openSandbox={openSandbox} /> : null}
        {sub === "vault" && account && !canManageCredentialSecrets ? <div className="dash-page"><div className="card access-denied"><div className="card-h">Access denied</div><p>Credential Vault management is available to organization admins.</p><button className="btn" onClick={() => go("dashboard/sandboxes")}>Back to sandboxes</button></div></div> : null}
        {sub === "vault" && canManageCredentialSecrets ? <VaultRoute /> : null}
        {sub === "metrics" ? <UsageRoute /> : null}
        {sub === "keys" ? <ApiKeysRoute /> : null}
        {sub === "members" && account && !canManageMembers ? <div className="dash-page"><div className="card access-denied"><div className="card-h">Access denied</div><p>Member management is available to organization admins.</p><button className="btn" onClick={() => go("dashboard/sandboxes")}>Back to sandboxes</button></div></div> : null}
        {sub === "members" && canManageMembers ? <MembersRoute /> : null}
        {sub === "settings" ? <SettingsRoute /> : null}
      </main>
    </div>
  );
};

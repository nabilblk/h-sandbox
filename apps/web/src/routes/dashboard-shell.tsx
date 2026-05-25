import { useEffect, useState } from "react";
import type { OrganizationSettings } from "@harakiri/shared";
import { api } from "../api";
import type { UserProfile } from "../auth";
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
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  useEffect(() => { api.me().then((r) => setOrganization(r.organization)).catch(() => undefined); }, []);
  const org = organization ?? defaultWorkspace(profile);
  const orgInitial = (org.name || profile?.email || "H").slice(0, 1).toUpperCase();
  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-side-brand"><button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button></div>
        <div className="org-switcher"><div className="org-ava">{orgInitial}</div><div style={{ flex: 1 }}><div className="org-name">{org.slug}</div><div className="org-plan">Team - 4 seats</div></div><Icon name="chevDown" size={12} /></div>
        <nav className="side-nav">
          {[
            ["dashboard/sandboxes", "Sandboxes", "box"],
            ["dashboard/templates", "Templates", "folder"],
            ["dashboard/metrics", "Usage", "chart"],
            ["dashboard/keys", "API keys", "key"],
            ["dashboard/members", "Members", "user"],
            ["dashboard/settings", "Settings", "settings"]
          ].map(([key, label, icon]) => (
            <a key={key} className={`side-link ${route === key ? "active" : ""}`} onClick={() => go(key as Route)}><Icon name={icon} size={14} /><span>{label}</span></a>
          ))}
        </nav>
        <div className="side-foot"><div className="usage-mini"><div className="usage-mini-h"><span>Status</span><span className="num" style={{ color: "var(--ok)" }}>operational</span></div><div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>v0.41.2 - all systems</div></div></div>
      </aside>
      <main className="dash-main">
        <div className="dash-top"><div className="dash-crumbs"><span style={{ color: "var(--muted)" }}>{org.slug}</span><Icon name="chevron" size={11} /><span style={{ textTransform: "capitalize" }}>{sub}</span></div><div className="dash-top-r"><button className="btn btn-ghost btn-sm"><Icon name="search" size={13} /><span className="kbd">CmdK</span></button><button className="btn btn-ghost btn-sm" onClick={() => go("docs")}><Icon name="book" size={13} /></button><button className="btn btn-ghost btn-sm"><Icon name="bell" size={13} /></button><button className="ava-sm" onClick={onSignOut} title={profile?.email ?? "Sign out"}>{orgInitial}</button></div></div>
        {sub === "sandboxes" ? <SandboxesRoute openSandbox={openSandbox} /> : null}
        {sub === "templates" ? <TemplatesRoute openSandbox={openSandbox} /> : null}
        {sub === "metrics" ? <UsageRoute /> : null}
        {sub === "keys" ? <ApiKeysRoute /> : null}
        {sub === "members" ? <MembersRoute /> : null}
        {sub === "settings" ? <SettingsRoute /> : null}
      </main>
    </div>
  );
};

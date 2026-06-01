import type { UserProfile } from "../auth";
import type { GoToRoute } from "../routes/types";
import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { Icon } from "./icon";

export type TopNavProps = {
  go: GoToRoute;
  profile?: UserProfile | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  authStatus?: string;
  active?: "landing" | "docs" | "changelog";
};

export const TopNav = ({ go, profile, onSignIn, onSignOut, authStatus, active = "landing" }: TopNavProps) => {
  const initial = (profile?.name ?? profile?.email ?? "H").slice(0, 1).toUpperCase();
  return (
    <div className="topnav">
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button>
        <div className="links" style={{ marginLeft: 8 }}>
          <button type="button" className={active === "docs" ? "active" : ""} onClick={() => go("docs")}>Docs</button>
          <button type="button" className={active === "changelog" ? "active" : ""} onClick={() => go("changelog")}>Changelog</button>
        </div>
      </div>
      <div className="right">
        {profile && onSignOut ? (
          <AccountMenu profile={profile} workspace="Harakiri" avatarLabel={initial} onSignOut={onSignOut} />
        ) : authStatus === "checking" ? (
          <button className="btn btn-ghost btn-sm" disabled><span className="spinner" /> Checking</button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={onSignIn}>Sign in</button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => go("onboarding")}>Get started <Icon name="arrowR" size={12} /></button>
      </div>
    </div>
  );
};

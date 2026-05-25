import type { UserProfile } from "../auth";
import type { GoToRoute } from "../routes/types";
import { Brand } from "./brand";
import { Icon } from "./icon";

export type TopNavProps = {
  go: GoToRoute;
  profile?: UserProfile | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
};

export const TopNav = ({ go, profile, onSignIn, onSignOut }: TopNavProps) => (
  <div className="topnav">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <button className="btn btn-ghost" onClick={() => go("landing")} style={{ padding: 0, height: "auto" }}><Brand /></button>
      <div className="links" style={{ marginLeft: 8 }}>
        <a onClick={() => go("docs")}>Docs</a>
        <a>Changelog</a>
      </div>
    </div>
    <div className="right">
      {profile ? <button className="btn btn-ghost btn-sm" onClick={onSignOut}>{profile.email ?? "Sign out"}</button> : <button className="btn btn-ghost btn-sm" onClick={onSignIn}>Sign in</button>}
      <button className="btn btn-primary btn-sm" onClick={() => go("onboarding")}>Get started <Icon name="arrowR" size={12} /></button>
    </div>
  </div>
);

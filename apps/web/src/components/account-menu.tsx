import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "../auth";
import { Icon } from "./icon";

export const AccountMenu = ({
  profile,
  workspace,
  avatarLabel,
  onSignOut,
  compact = false
}: {
  profile?: UserProfile | null;
  workspace?: string;
  avatarLabel: string;
  onSignOut: () => void;
  compact?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const name = profile?.name ?? profile?.email ?? "Signed in";
  const email = profile?.email ?? "Keycloak session";

  return (
    <div className="account-menu" ref={ref}>
      <button className={`account-trigger ${compact ? "compact" : ""}`} onClick={() => setOpen((next) => !next)} aria-label={`Account: ${name}`} title={email} aria-expanded={open}>
        <span className="ava-sm">{avatarLabel}</span>
        {compact ? null : <span className="account-trigger-label">{profile?.email ?? "Account"}</span>}
        <Icon name="chevDown" size={11} />
      </button>
      {open ? (
        <div className="account-popover">
          <div className="account-popover-head">
            <span className="org-ava">{avatarLabel}</span>
            <div>
              <div className="account-name">{name}</div>
              <div className="account-email">{email}</div>
            </div>
          </div>
          {workspace ? <div className="account-workspace">{workspace}</div> : null}
          <button className="account-menu-item" onClick={() => { setOpen(false); onSignOut(); }}>
            <Icon name="lock" size={13} />
            <span>Sign out of Harakiri and Keycloak</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};

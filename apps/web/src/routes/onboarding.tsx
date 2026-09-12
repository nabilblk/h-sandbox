import { useEffect, useState } from "react";
import type { CurrentAccountResponse, CreateApiKeyResponse } from "@harakiri/shared";
import { api } from "../api";
import { CapacitySummary, useOrganizationCapacity } from "../capacity";
import { FirstSandboxTaskPanel } from "../components/first-sandbox-task";
import type { UserProfile } from "../auth";
import { Brand } from "../components/brand";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { defaultWorkspace } from "../workspace";
import type { GoToRoute } from "./types";

export const OnboardingRoute = ({ go, profile }: { go: GoToRoute; profile?: UserProfile | null }) => {
  const [step, setStep] = useState(0);
  const capacity = useOrganizationCapacity();
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [account, setAccount] = useState<CurrentAccountResponse | null>(null);
  const [workspace, setWorkspace] = useState(defaultWorkspace(profile));
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const canManage = account?.capabilities.canManageSettings === true;
  const load = async () => {
    try {
      const [settings, current] = await Promise.all([api.settings(), api.me()]);
      setWorkspace(settings.organization); setAccount(current); setLoaded(true); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load your workspace."); }
  };
  useEffect(() => { void load(); }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy || !loaded) return;
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { capacity.acceptError(e); setError(e instanceof Error ? e.message : "The request failed. Please retry."); }
    finally { setBusy(false); }
  };
  const saveWorkspace = () => perform(async () => {
    if (canManage) setWorkspace((await api.updateSettings({ name: workspace.name, slug: workspace.slug })).organization);
    setStep(2);
  });
  const createKey = () => perform(async () => { setCreatedKey(await api.createKey("onboarding")); setStep(3); });
  const openDashboard = () => perform(async () => { await api.completeOnboarding(); go("dashboard/sandboxes"); });
  return <div className="onb">
    <div className="onb-bar"><Brand /><div className="right"><a onClick={() => go("landing")}>Exit setup -&gt;</a></div></div>
    <div className="onb-wrap"><div className="onb-steps">{["Account", "Workspace", "API key", "Hello, sandbox"].map((label, i) => <div key={label} className={`onb-step ${i === step ? "active" : i < step ? "done" : ""}`}><div className="onb-num">{i < step ? <Icon name="check" size={11} /> : i + 1}</div><div className="onb-step-l">{label}</div></div>)}</div>
      <div className="onb-body">
        {error ? <div role="alert" className="build-inline-alert">{error}{!loaded ? <button className="btn btn-sm" onClick={() => void load()}>Retry</button> : null}</div> : null}
        {step === 0 ? <div>
          <h1 className="onb-h">Welcome to Harakiri.</h1>
          <div className="onb-section"><Field label="Full name"><input className="input" readOnly value={account?.user.fullName ?? profile?.name ?? ""} /></Field><Field label="Work email"><input className="input" readOnly value={account?.user.email ?? profile?.email ?? ""} /></Field></div>
          <div className="onb-foot"><button className="btn btn-primary" disabled={!loaded} onClick={() => setStep(1)}>Continue <Icon name="arrowR" size={11} /></button></div>
        </div> : null}
        {step === 1 ? <div>
          <h1 className="onb-h">Your workspace.</h1>
          {!canManage ? <p className="onb-sub">You joined {workspace.name} as a member. Organization settings are managed by admins.</p> : null}
          <div className="onb-section" style={{ maxWidth: 560 }}><Field label="Organization name"><input aria-label="Organization name" className="input" readOnly={!canManage} value={workspace.name} onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })} /></Field><Field label="Slug"><input aria-label="Slug" className="input mono" readOnly={!canManage} value={workspace.slug} onChange={(e) => setWorkspace({ ...workspace, slug: e.target.value })} /></Field></div>
          <div className="onb-foot"><button className="btn" disabled={busy} onClick={() => setStep(0)}>Back</button><button className="btn btn-primary" disabled={busy || !loaded} onClick={saveWorkspace}>Continue <Icon name="arrowR" size={11} /></button></div>
        </div> : null}
        {step === 2 ? <div>
          <h1 className="onb-h">Your first API key.</h1><p className="onb-sub">Runtime permissions. Expires in 90 days. No organization administration access.</p>
          <div className="onb-foot"><button className="btn" disabled={busy} onClick={() => setStep(1)}>Back</button><button className="btn btn-primary" disabled={busy} onClick={createKey}>Create key <Icon name="key" size={11} /></button><button className="btn btn-ghost" disabled={busy} onClick={() => setStep(3)}>Skip</button></div>
        </div> : null}
        {step === 3 ? <div>
          <CapacitySummary state={capacity} canManage={canManage} />
          <h1 className="onb-h">Hello, sandbox.</h1>
          {createdKey ? <div className="onb-section"><div className="field-l">API key. Shown once.</div><div className="key-secret"><code>{createdKey.token}</code><button className="btn btn-ghost btn-sm" aria-label="Copy API key" title="Copy API key" onClick={() => void navigator.clipboard.writeText(createdKey.token).catch(() => setError("Clipboard unavailable. Select the key to copy it."))}><Icon name="copy" /></button></div><p className="key-metadata">Expires {createdKey.key.expiresAt ? new Date(createdKey.key.expiresAt).toLocaleDateString() : "unknown"}</p></div> : null}
          {account ? <FirstSandboxTaskPanel key={`${account.auth.organizationId}:${account.user.id}`} account={account} onError={capacity.acceptError} /> : null}
          <div className="onb-foot"><button className="btn btn-primary" disabled={busy} onClick={openDashboard}>Open dashboard <Icon name="arrowR" size={11} /></button></div>
        </div> : null}
      </div>
    </div>
  </div>;
};

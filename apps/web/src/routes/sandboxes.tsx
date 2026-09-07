import { useEffect, useMemo, useState } from "react";
import {
  TEMPLATES,
  customCredentialProfilesShareScope,
  egressPresetCatalog,
  type CredentialSecretSummary,
  type CreateSandboxBody,
  type DynamicCredentialIssuerSummary,
  type EgressMode,
  type EgressPresetId,
  type ExternalSecretReferenceSummary,
  type SandboxSummary,
  type Template,
  type TemplateCredentialSlot,
  type TemplateCredentialSlotMappingBody
} from "@harakiri/shared";
import { api } from "../api";
import { EgressModePicker } from "../components/egress-mode-picker";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import type { WorkspacesResponse } from "@harakiri/shared";

export const SandboxesRoute = ({ openSandbox }: { openSandbox: (id: string) => void }) => {
  const [rows, setRows] = useState<SandboxSummary[]>([]);
  const [filter, setFilter] = useState("running");
  const [q, setQ] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const load = () => api.sandboxes().then((r) => setRows(r.sandboxes));
  useEffect(() => { void load(); }, []);
  const matchesFilter = (sandbox: SandboxSummary) => {
    if (filter === "all") return true;
    if (filter === "history") return sandbox.status === "terminated";
    return sandbox.status === filter;
  };
  const query = q.trim().toLowerCase();
  const availableTemplates = Array.from(new Set(rows.map((row) => row.template))).filter(Boolean).sort();
  const filtered = rows
    .filter((s) =>
      matchesFilter(s) &&
      (templateFilter === "all" || s.template === templateFilter) &&
      (!query || s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query) || s.template.toLowerCase().includes(query))
    )
    .sort((a, b) => {
      const order = { running: 0, idle: 1, error: 2, terminated: 3 } as Record<string, number>;
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  const counts = {
    running: rows.filter((s) => s.status === "running").length,
    idle: rows.filter((s) => s.status === "idle").length,
    error: rows.filter((s) => s.status === "error").length,
    history: rows.filter((s) => s.status === "terminated").length
  };
  const tabs = [
    ["running", "Running", counts.running],
    ["idle", "Idle", counts.idle],
    ["error", "Error", counts.error],
    ["history", "History", counts.history],
    ["all", "All", rows.length]
  ] as const;
  const emptyCopy = filter === "running" ? "No running sandboxes." : filter === "history" ? "No terminated sandboxes in history." : `No ${filter} sandboxes.`;
  return (
    <div className="dash-page sandbox-workspace">
      <div className="page-head"><div><h1 className="page-h">Sandboxes</h1><div className="page-sub"><span><span className="dot live" /> <b className="num">{counts.running}</b> running</span><span><span className="dot idle" /> <b className="num">{counts.idle}</b> idle</span><span><span className="dot err" /> <b className="num">{counts.error}</b> errored</span></div></div><div style={{ display: "flex", gap: 8 }}><button className="btn btn-sm" onClick={load}><Icon name="refresh" size={12} /> Refresh</button><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Icon name="plus" size={12} /> New sandbox</button></div></div>
      <div className="filter-bar"><div className="filter-tabs">{tabs.map(([key, label, count]) => <button key={key} className={`filter-tab ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{label} <span className="filter-count">{count}</span></button>)}</div><div className="filter-right"><div className="search-input"><Icon name="search" size={12} /><input placeholder="Filter by name, id, or template..." value={q} onChange={(e) => setQ(e.target.value)} /></div><select className="input filter-select" aria-label="Template filter" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}><option value="all">All templates</option>{availableTemplates.map((template) => <option key={template} value={template}>{template}</option>)}</select></div></div>
      <div className="sbx-table card"><div className="sbx-tr sbx-head"><div>Name</div><div>Status</div><div>Template</div><div>CPU</div><div>Mem</div><div>Started</div><div /></div>{filtered.map((s) => <div key={s.id} className="sbx-tr" onClick={() => openSandbox(s.id)}><div><div className="sbx-name">{s.name}</div><div className="sbx-id num">{s.id}</div></div><div><span className={`pill ${s.status === "running" ? "live" : s.status === "idle" ? "idle" : s.status === "error" ? "err" : ""}`}><span className="dot" /> {s.status}</span></div><div><span className="tag">{s.template}</span></div><div className="num"><span className="meter"><span className="meter-fill" style={{ width: `${s.cpu}%`, background: s.cpu > 50 ? "var(--warn)" : "var(--ok)" }} /></span>{s.cpu}%</div><div className="num">{s.mem} MB</div><div className="num" style={{ color: "var(--muted)" }}>{s.started}</div><div className="ta-r"><button className="btn btn-ghost btn-sm">Open <Icon name="arrowR" size={11} /></button></div></div>)}{filtered.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">{emptyCopy}</div><div className="sbx-empty-sub">{filter === "running" ? "Create a sandbox to start working, or open History to review terminated runs." : "Try another status filter or clear the search field."}</div><div className="sbx-empty-actions"><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Icon name="plus" size={12} /> New sandbox</button>{filter === "running" ? <button className="btn btn-sm" onClick={() => setFilter("history")}>View history</button> : null}</div></div>}</div>
      <div className="dash-foot-tip">Tip: kill all idle sandboxes with <code>harakiri kill --idle</code>. Or set TTL per template.</div>
      {showCreate ? <CreateModal onClose={() => setShowCreate(false)} onCreate={(id) => { setShowCreate(false); void load(); openSandbox(id); }} /> : null}
    </div>
  );
};

type SlotSourceMode = "empty" | "workspace" | "external" | "dynamic" | "inline";

export type CredentialSlotDraft = {
  slotId: string;
  sourceMode: SlotSourceMode;
  sourceRef: string;
  value: string;
  displayName: string;
};

export const parseSandboxEnvText = (envText: string) => {
  const env: Record<string, string> = {};
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) throw new Error("Environment rows must use KEY=value.");
    const key = line.slice(0, index);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`${key} is not a valid environment key.`);
    env[key] = line.slice(index + 1);
  }
  return env;
};

const activeCredentialSecrets = (secrets: CredentialSecretSummary[]) =>
  secrets.filter((secret) => secret.status === "active" && secret.hasEncryptedSecret);

const activeExternalReferences = (references: ExternalSecretReferenceSummary[]) =>
  references.filter((reference) => reference.status === "active" && reference.validation.state === "valid");

const activeDynamicIssuers = (issuers: DynamicCredentialIssuerSummary[]) =>
  issuers.filter((issuer) => issuer.status === "active" && issuer.validation.state === "valid");

const sourceMatchesSlot = (
  slot: TemplateCredentialSlot,
  source: { providerPresetId: string; customProfile?: CredentialSecretSummary["customProfile"] }
) => source.providerPresetId === slot.providerPresetId && (
  slot.providerPresetId !== "custom"
  || customCredentialProfilesShareScope(slot.customProfile, source.customProfile)
);

const matchingSecretsForSlot = (slot: TemplateCredentialSlot, secrets: CredentialSecretSummary[]) =>
  secrets.filter((secret) => sourceMatchesSlot(slot, secret));

const matchingReferencesForSlot = (slot: TemplateCredentialSlot, references: ExternalSecretReferenceSummary[]) =>
  references.filter((reference) => sourceMatchesSlot(slot, reference));

const matchingIssuersForSlot = (slot: TemplateCredentialSlot, issuers: DynamicCredentialIssuerSummary[]) =>
  issuers.filter((issuer) => sourceMatchesSlot(slot, issuer));

export const createCredentialSlotDrafts = (
  slots: TemplateCredentialSlot[],
  secrets: CredentialSecretSummary[],
  references: ExternalSecretReferenceSummary[] = [],
  issuers: DynamicCredentialIssuerSummary[] = []
): CredentialSlotDraft[] => slots.map((slot) => {
  const secret = matchingSecretsForSlot(slot, secrets)[0];
  const reference = matchingReferencesForSlot(slot, references)[0];
  const issuer = matchingIssuersForSlot(slot, issuers)[0];
  const sourceMode: SlotSourceMode = secret ? "workspace" : reference ? "external" : issuer ? "dynamic" : slot.required ? "inline" : "empty";
  return {
    slotId: slot.id,
    sourceMode,
    sourceRef: secret?.id ?? reference?.id ?? issuer?.id ?? "",
    value: "",
    displayName: slot.label
  };
});

const draftForSlot = (slot: TemplateCredentialSlot, drafts: CredentialSlotDraft[]) =>
  drafts.find((draft) => draft.slotId === slot.id) ?? createCredentialSlotDrafts([slot], [])[0];

export const buildCredentialMappings = (
  slots: TemplateCredentialSlot[],
  drafts: CredentialSlotDraft[]
): TemplateCredentialSlotMappingBody[] => {
  const mappings: TemplateCredentialSlotMappingBody[] = [];
  for (const slot of slots) {
    const draft = draftForSlot(slot, drafts);
    if (draft.sourceMode === "empty") {
      if (slot.required) throw new Error(`${slot.label} credential is required.`);
      continue;
    }
    if (draft.sourceMode === "workspace" && !draft.sourceRef) throw new Error(`Choose a workspace secret for ${slot.label}.`);
    if (draft.sourceMode === "external" && !draft.sourceRef) throw new Error(`Choose an external reference for ${slot.label}.`);
    if (draft.sourceMode === "dynamic" && !draft.sourceRef) throw new Error(`Choose a dynamic issuer for ${slot.label}.`);
    if (draft.sourceMode === "inline" && !draft.value) throw new Error(`Enter a one-time value for ${slot.label}.`);
    mappings.push(credentialMappingFor(slot, draft));
  }
  return mappings;
};

const credentialMappingFor = (
  slot: TemplateCredentialSlot,
  draft: CredentialSlotDraft
): TemplateCredentialSlotMappingBody => {
  const displayName = draft.displayName.trim() || slot.label;
  if (draft.sourceMode === "workspace") {
    return { slotId: slot.id, source: { sourceType: "harakiri_encrypted", secretId: draft.sourceRef, displayName } };
  }
  if (draft.sourceMode === "external") {
    return { slotId: slot.id, source: { sourceType: "external_ref", referenceId: draft.sourceRef, displayName } };
  }
  if (draft.sourceMode === "dynamic") {
    return { slotId: slot.id, source: { sourceType: "dynamic", issuerId: draft.sourceRef, displayName } };
  }
  return { slotId: slot.id, source: { sourceType: "inline_ephemeral", value: draft.value, displayName } };
};

export const assertNoCredentialEnvConflict = (
  env: Record<string, string>,
  slots: TemplateCredentialSlot[],
  mappings: TemplateCredentialSlotMappingBody[]
) => {
  const mappedSlotIds = new Set(mappings.map((mapping) => mapping.slotId).filter(Boolean));
  for (const slot of slots.filter((candidate) => mappedSlotIds.has(candidate.id))) {
    const conflictingKey = Object.keys(slot.fakeEnv).find((key) => Object.prototype.hasOwnProperty.call(env, key));
    if (conflictingKey) throw new Error(`${conflictingKey} is reserved by credential slot ${slot.label}.`);
  }
};

const activeTemplateOptions = (templates: Template[]) =>
  templates.filter((template) => template.status !== "archived");

const defaultTemplateId = (templates: Template[]) =>
  templates.find((template) => template.id === "python-3.12-data")?.id ?? templates[0]?.id ?? "python-3.12-data";

const allowTargetsFromText = (allowTarget: string) =>
  allowTarget.split(",").map((value) => value.trim()).filter(Boolean);

export const buildCreateSandboxBody = ({
  allowTarget,
  credentialSlots,
  egressMode,
  egressPresets,
  envText,
  name,
  slotDrafts,
  template,
  ttlSeconds,
  workspaceId
}: {
  allowTarget: string;
  credentialSlots: TemplateCredentialSlot[];
  egressMode: EgressMode;
  egressPresets: EgressPresetId[];
  envText: string;
  name: string;
  slotDrafts: CredentialSlotDraft[];
  template: string;
  ttlSeconds: number;
  workspaceId?: string;
}): CreateSandboxBody => {
  const env = parseSandboxEnvText(envText);
  const allow = allowTargetsFromText(allowTarget);
  const credentialMappings = buildCredentialMappings(credentialSlots, slotDrafts);
  assertNoCredentialEnvConflict(env, credentialSlots, credentialMappings);
  return {
    template,
    name,
    ttlSeconds,
    workspaceId: workspaceId || undefined,
    env,
    credentialMappings: credentialMappings.length ? credentialMappings : undefined,
    egress: egressMode === "open" && !egressPresets.length && !allow.length ? undefined : { mode: egressMode, presets: egressPresets, allow }
  };
};

const loadSandboxLaunchOptions = async () => {
  const [templateResult, secretResult, referenceResult, issuerResult] = await Promise.allSettled([
    api.templates("?status=active&limit=100"),
    api.credentialSecrets(),
    api.externalSecretReferences(),
    api.dynamicCredentialIssuers()
  ]);
  const templates = templateResult.status === "fulfilled" && templateResult.value.templates.length
    ? templateResult.value.templates
    : TEMPLATES;
  const secrets = secretResult.status === "fulfilled" ? secretResult.value.secrets : [];
  const references = referenceResult.status === "fulfilled" ? referenceResult.value.references : [];
  const issuers = issuerResult.status === "fulfilled" ? issuerResult.value.issuers : [];
  return { templates, secrets, references, issuers };
};

export const CreateModal = ({ onClose, onCreate, initialWorkspaceId = "" }: { onClose: () => void; onCreate: (id: string) => void; initialWorkspaceId?: string }) => {
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse | null>(null);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [workspaceError, setWorkspaceError] = useState("");
  useEffect(() => {
    let active = true;
    api.workspaces().then((result) => { if (active) setWorkspaces(result); }).catch((cause) => { if (active) setWorkspaceError(cause instanceof Error ? cause.message : "Workspace storage unavailable."); });
    return () => { active = false; };
  }, []);
  const [templates, setTemplates] = useState<Template[]>(TEMPLATES);
  const [credentialSecrets, setCredentialSecrets] = useState<CredentialSecretSummary[]>([]);
  const [externalReferences, setExternalReferences] = useState<ExternalSecretReferenceSummary[]>([]);
  const [dynamicIssuers, setDynamicIssuers] = useState<DynamicCredentialIssuerSummary[]>([]);
  const [template, setTemplate] = useState(defaultTemplateId(TEMPLATES));
  const [slotDrafts, setSlotDrafts] = useState<CredentialSlotDraft[]>([]);
  const [name, setName] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState(300);
  const [envText, setEnvText] = useState("");
  const [egressMode, setEgressMode] = useState<EgressMode>("open");
  const [egressPresets, setEgressPresets] = useState<EgressPresetId[]>([]);
  const [allowTarget, setAllowTarget] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const activeSecrets = useMemo(() => activeCredentialSecrets(credentialSecrets), [credentialSecrets]);
  const activeReferences = useMemo(() => activeExternalReferences(externalReferences), [externalReferences]);
  const activeIssuers = useMemo(() => activeDynamicIssuers(dynamicIssuers), [dynamicIssuers]);
  const templateOptions = useMemo(() => activeTemplateOptions(templates), [templates]);
  const selectedTemplate = useMemo(
    () => templateOptions.find((candidate) => candidate.id === template) ?? templateOptions[0],
    [template, templateOptions]
  );
  const credentialSlots = selectedTemplate?.credentialSlots ?? [];

  useEffect(() => {
    let mounted = true;
    const loadLaunchOptions = async () => {
      const result = await loadSandboxLaunchOptions();
      if (!mounted) return;
      const nextTemplates = result.templates;
      const nextSecrets = result.secrets;
      const nextReferences = result.references;
      const nextIssuers = result.issuers;
      const nextTemplate = activeTemplateOptions(nextTemplates).find((item) => item.id === template) ?? activeTemplateOptions(nextTemplates)[0];
      setTemplates(nextTemplates);
      setCredentialSecrets(nextSecrets);
      setExternalReferences(nextReferences);
      setDynamicIssuers(nextIssuers);
      setTemplate(nextTemplate?.id ?? defaultTemplateId(nextTemplates));
      setSlotDrafts(createCredentialSlotDrafts(
        nextTemplate?.credentialSlots ?? [],
        activeCredentialSecrets(nextSecrets),
        activeExternalReferences(nextReferences),
        activeDynamicIssuers(nextIssuers)
      ));
      setOptionsLoading(false);
    };
    void loadLaunchOptions();
    return () => { mounted = false; };
  }, []);

  const selectTemplate = (templateId: string) => {
    const nextTemplate = templateOptions.find((candidate) => candidate.id === templateId);
    setTemplate(templateId);
    setSlotDrafts(createCredentialSlotDrafts(nextTemplate?.credentialSlots ?? [], activeSecrets, activeReferences, activeIssuers));
  };

  const togglePreset = (presetId: EgressPresetId) => {
    setEgressPresets((current) => current.includes(presetId) ? current.filter((id) => id !== presetId) : [...current, presetId]);
    if (egressMode === "open") setEgressMode("restricted");
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.createSandbox(buildCreateSandboxBody({
        allowTarget,
        credentialSlots,
        egressMode,
        egressPresets,
        envText,
        name,
        slotDrafts,
        template,
        ttlSeconds,
        workspaceId
      }));
      onCreate(result.sandbox.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal modal-sandbox-create card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>New sandbox</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12} /></button>
        </div>
        <div className="modal-body">
          <TemplateField
            loading={optionsLoading}
            onSelect={selectTemplate}
            selectedTemplate={selectedTemplate}
            template={template}
            templates={templateOptions}
          />
          <Field label="Name (optional)" hint="A label for your own reference">
            <input className="input" placeholder="agent-eval-runner" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <SandboxResourceFields ttlSeconds={ttlSeconds} onTtlChange={setTtlSeconds} />
          <Field label="Persistent workspace">
            <select className="input" aria-label="Persistent workspace" disabled={!workspaces?.policy.available || loading} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              <option value="">None (ephemeral files)</option>
              {workspaces?.workspaces.filter((row) => row.status === "available").map((row) => <option key={row.id} value={row.id}>{row.name} ({row.sizeGiB} GiB)</option>)}
            </select>
            {workspaceError ? <div role="alert" className="field-h">{workspaceError}</div> : null}
            {workspaceId ? <div className="field-h">Mounted at /workspace. Files remain after sandbox termination.</div> : null}
          </Field>
          <CredentialSlotSection
            drafts={slotDrafts}
            issuers={activeIssuers}
            onDraftsChange={setSlotDrafts}
            references={activeReferences}
            secrets={activeSecrets}
            slots={credentialSlots}
          />
          <OutboundAccessField
            allowTarget={allowTarget}
            egressMode={egressMode}
            egressPresets={egressPresets}
            onAllowTargetChange={setAllowTarget}
            onModeChange={setEgressMode}
            onTogglePreset={togglePreset}
          />
          <Field label="Environment" hint="KEY=value per line">
            <textarea className="input mono sandbox-env-input" spellCheck={false} placeholder="HARAKIRI_ENV=dev" value={envText} onChange={(event) => setEnvText(event.target.value)} />
          </Field>
          {error ? <div className="build-inline-alert"><span>{error}</span></div> : null}
          <div className="cost-est"><span style={{ color: "var(--muted)" }}>Cold start</span><span className="num">~142ms - idle TTL {ttlSeconds}s</span></div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || optionsLoading || Boolean(workspaceId && !workspaces?.workspaces.some((row) => row.id === workspaceId && row.status === "available"))}>{loading ? <><span className="spinner" /> Provisioning...</> : <>Create sandbox <Icon name="arrowR" size={11} /></>}</button>
        </div>
      </div>
    </div>
  );
};

const TemplateField = ({
  loading,
  onSelect,
  selectedTemplate,
  template,
  templates
}: {
  loading: boolean;
  onSelect: (templateId: string) => void;
  selectedTemplate?: Template;
  template: string;
  templates: Template[];
}) => (
  <Field label="Template">
    <select className="input" value={template} onChange={(event) => onSelect(event.target.value)}>
      {templates.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
    </select>
    {selectedTemplate ? <div className="sandbox-template-meta"><Icon name={selectedTemplate.icon} size={12} /> {selectedTemplate.runtimeFamily} - {selectedTemplate.cpuCount} vCPU - {selectedTemplate.memoryMb.toLocaleString()} MB</div> : null}
    {loading ? <div className="field-h">Loading workspace templates...</div> : null}
  </Field>
);

const SandboxResourceFields = ({ ttlSeconds, onTtlChange }: { ttlSeconds: number; onTtlChange: (value: number) => void }) => (
  <div className="sandbox-create-split">
    <Field label="Idle TTL">
      <input className="input mono" type="number" value={ttlSeconds} onChange={(event) => onTtlChange(Number(event.target.value))} />
    </Field>
    <Field label="Resources">
      <select className="input"><option>Template default</option><option>2 vCPU - 2 GiB</option><option>4 vCPU - 4 GiB</option></select>
    </Field>
  </div>
);

const OutboundAccessField = ({
  allowTarget,
  egressMode,
  egressPresets,
  onAllowTargetChange,
  onModeChange,
  onTogglePreset
}: {
  allowTarget: string;
  egressMode: EgressMode;
  egressPresets: EgressPresetId[];
  onAllowTargetChange: (value: string) => void;
  onModeChange: (value: EgressMode) => void;
  onTogglePreset: (value: EgressPresetId) => void;
}) => (
  <Field label="Outbound access">
    <EgressModePicker value={egressMode} compact onChange={onModeChange} />
    <div className="egress-presets compact">
      {Object.entries(egressPresetCatalog).slice(0, 4).map(([id, preset]) => (
        <button key={id} className={`preset-chip ${egressPresets.includes(id as EgressPresetId) ? "active" : ""}`} onClick={() => onTogglePreset(id as EgressPresetId)}>
          <span>{preset.label}</span><small>{preset.domains.length} domains</small>
        </button>
      ))}
    </div>
    <input
      className="input"
      placeholder="Extra allowed domains, comma separated"
      value={allowTarget}
      onChange={(event) => {
        onAllowTargetChange(event.target.value);
        if (egressMode === "open" && event.target.value.trim()) onModeChange("restricted");
      }}
    />
  </Field>
);

const CredentialSlotSection = ({
  drafts,
  issuers,
  onDraftsChange,
  references,
  secrets,
  slots
}: {
  drafts: CredentialSlotDraft[];
  issuers: DynamicCredentialIssuerSummary[];
  onDraftsChange: (drafts: CredentialSlotDraft[]) => void;
  references: ExternalSecretReferenceSummary[];
  secrets: CredentialSecretSummary[];
  slots: TemplateCredentialSlot[];
}) => {
  if (!slots.length) return null;
  const updateDraft = (slotId: string, patch: Partial<CredentialSlotDraft>) => {
    onDraftsChange(drafts.map((draft) => draft.slotId === slotId ? { ...draft, ...patch } : draft));
  };
  return (
    <Field label="Credentials" hint="Map required template slots before launch.">
      <div className="credential-slot-list">
        {slots.map((slot) => (
          <CredentialSlotRow
            draft={draftForSlot(slot, drafts)}
            key={slot.id}
            onDraftChange={(patch) => updateDraft(slot.id, patch)}
            issuers={matchingIssuersForSlot(slot, issuers)}
            references={matchingReferencesForSlot(slot, references)}
            secrets={matchingSecretsForSlot(slot, secrets)}
            slot={slot}
          />
        ))}
      </div>
    </Field>
  );
};

const CredentialSlotRow = ({
  draft,
  issuers,
  onDraftChange,
  references,
  secrets,
  slot
}: {
  draft: CredentialSlotDraft;
  issuers: DynamicCredentialIssuerSummary[];
  onDraftChange: (patch: Partial<CredentialSlotDraft>) => void;
  references: ExternalSecretReferenceSummary[];
  secrets: CredentialSecretSummary[];
  slot: TemplateCredentialSlot;
}) => {
  const chooseMode = (sourceMode: SlotSourceMode) => {
    const selectedRef = sourceMode === "workspace"
      ? secrets[0]?.id
      : sourceMode === "external"
        ? references[0]?.id
        : sourceMode === "dynamic"
          ? issuers[0]?.id
        : "";
    onDraftChange({
      sourceMode,
      sourceRef: selectedRef ?? "",
      value: sourceMode === "inline" ? draft.value : ""
    });
  };
  return (
    <div className="credential-slot-row">
      <div className="credential-slot-head">
        <span><b>{slot.label}</b><small>{slot.envName} - {slot.customProfile?.host ?? slot.providerPresetId}</small></span>
        <span className="tag">{slot.required ? "required" : "optional"}</span>
      </div>
      <div className="credential-source-tabs">
        {!slot.required ? <button type="button" className={`btn btn-sm ${draft.sourceMode === "empty" ? "active" : ""}`} onClick={() => chooseMode("empty")}>Skip</button> : null}
        <button type="button" className={`btn btn-sm ${draft.sourceMode === "workspace" ? "active" : ""}`} disabled={!secrets.length} onClick={() => chooseMode("workspace")}>Workspace secret</button>
        <button type="button" className={`btn btn-sm ${draft.sourceMode === "external" ? "active" : ""}`} disabled={!references.length} onClick={() => chooseMode("external")}>External reference</button>
        <button type="button" className={`btn btn-sm ${draft.sourceMode === "dynamic" ? "active" : ""}`} disabled={!issuers.length} onClick={() => chooseMode("dynamic")}>Dynamic issuer</button>
        <button type="button" className={`btn btn-sm ${draft.sourceMode === "inline" ? "active" : ""}`} onClick={() => chooseMode("inline")}>One-time value</button>
      </div>
      {draft.sourceMode === "workspace" ? (
        <select className="input" value={draft.sourceRef} onChange={(event) => onDraftChange({ sourceRef: event.target.value })}>
          {secrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name} - v{secret.version}</option>)}
        </select>
      ) : null}
      {draft.sourceMode === "external" ? (
        <select className="input" value={draft.sourceRef} onChange={(event) => onDraftChange({ sourceRef: event.target.value })}>
          {references.map((reference) => <option key={reference.id} value={reference.id}>{reference.name} - {reference.reference.namespace}/{reference.reference.name}</option>)}
        </select>
      ) : null}
      {draft.sourceMode === "dynamic" ? (
        <select className="input" value={draft.sourceRef} onChange={(event) => onDraftChange({ sourceRef: event.target.value })}>
          {issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name} - {issuer.scope.repositories.length} repositories</option>)}
        </select>
      ) : null}
      {draft.sourceMode === "inline" ? (
        <input className="input mono" type="password" placeholder={`${slot.envName} value`} value={draft.value} onChange={(event) => onDraftChange({ value: event.target.value })} />
      ) : null}
      <div className="credential-slot-domains">
        {slot.egressDomains.slice(0, 4).map((domain) => <span className="tag" key={domain}>{domain}</span>)}
        {slot.egressDomains.length > 4 ? <span className="tag">+{slot.egressDomains.length - 4}</span> : null}
      </div>
    </div>
  );
};

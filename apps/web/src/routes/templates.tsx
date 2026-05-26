import { useEffect, useMemo, useState } from "react";
import {
  TEMPLATES,
  egressModes,
  egressPresetCatalog,
  type EgressMode,
  type EgressPolicyInput,
  type EgressPresetId,
  type SandboxSummary,
  type Template,
  type TemplateBuildLogEntry,
  type TemplateBuildSummary,
  type TemplateVersionSummary,
  type UsageSummary
} from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatBytes, formatDateTime } from "../format";
import { setDocsPageSelection } from "./docs";

const openDocsPage = (pageId: string) => {
  setDocsPageSelection(pageId);
  location.hash = "docs";
};

const slugifyTemplateId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "custom-template";

const parseTemplatePorts = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((item) => Number(item.trim()))
        .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
    )
  );

const splitEntrypoint = (value: string) => value.trim().split(/\s+/).filter(Boolean);

const emptyEgressPolicy = (): EgressPolicyInput => ({ mode: "open", presets: [], allow: [], deny: [] });

const normalizeEgressPolicy = (policy?: EgressPolicyInput | null): EgressPolicyInput => ({
  mode: policy?.mode ?? "open",
  presets: policy?.presets ?? [],
  allow: policy?.allow ?? [],
  deny: policy?.deny ?? [],
  ...(policy?.defaultAction ? { defaultAction: policy.defaultAction } : {})
});

const splitDomainInput = (value: string) => value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const tomlString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const defaultDockerfile = `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y python3 python3-pip curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
CMD ["sleep", "3600"]
`;

const baseImageFromDockerfile = (dockerfile: string) => {
  for (const line of dockerfile.split(/\r?\n/)) {
    const match = line.trim().match(/^FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+\S+)?$/i);
    if (match?.[1]) return match[1];
  }
  return "ubuntu:24.04";
};

const iconForRuntime = (runtimeFamily: string, ports: number[]): Template["icon"] => {
  const runtime = runtimeFamily.toLowerCase();
  if (runtime.includes("python")) return "py";
  if (runtime.includes("node")) return "node";
  if (runtime.includes("browser") || ports.includes(3000) || ports.includes(5173)) return "globe";
  return "file";
};

const EgressPolicyControls = ({
  policy,
  onChange,
  disabled = false
}: {
  policy: EgressPolicyInput;
  onChange: (policy: EgressPolicyInput) => void;
  disabled?: boolean;
}) => {
  const normalized = normalizeEgressPolicy(policy);
  const [domain, setDomain] = useState("");
  const setMode = (mode: EgressMode) => onChange({ ...normalized, mode });
  const togglePreset = (presetId: EgressPresetId) => {
    const presets = new Set(normalized.presets);
    if (presets.has(presetId)) presets.delete(presetId);
    else presets.add(presetId);
    onChange({ ...normalized, presets: [...presets] });
  };
  const addAllow = () => {
    const values = splitDomainInput(domain);
    if (!values.length) return;
    onChange({ ...normalized, mode: normalized.mode === "open" ? "restricted" : normalized.mode, allow: Array.from(new Set([...(normalized.allow ?? []), ...values])) });
    setDomain("");
  };
  const removeTarget = (kind: "allow" | "deny", target: string) =>
    onChange({ ...normalized, [kind]: (normalized[kind] ?? []).filter((value) => value !== target) });
  return (
    <div className="template-egress-editor">
      <div className="segmented egress-modes">
        {egressModes.map((mode) => (
          <button key={mode} type="button" className={normalized.mode === mode ? "active" : ""} disabled={disabled} onClick={() => setMode(mode)}>{mode}</button>
        ))}
      </div>
      <div className="egress-presets compact">
        {Object.entries(egressPresetCatalog).map(([id, preset]) => {
          const presetId = id as EgressPresetId;
          const active = normalized.presets?.includes(presetId);
          return (
            <button key={id} type="button" className={`preset-chip ${active ? "active" : ""}`} disabled={disabled} onClick={() => togglePreset(presetId)}>
              <span>{preset.label}</span>
              <small>{preset.domains.length ? `${preset.domains.length} domains` : "open-mode helper"}</small>
            </button>
          );
        })}
      </div>
      <div className="egress-add">
        <input className="input" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="api.github.com or *.pythonhosted.org" disabled={disabled} />
        <button type="button" className="btn btn-sm" onClick={addAllow} disabled={disabled || !domain.trim()}><Icon name="plus" size={12} /> Add domain</button>
      </div>
      <div className="template-egress-targets">
        {(normalized.allow ?? []).map((target) => (
          <span key={`allow-${target}`} className="tag allow">allow {target}<button type="button" onClick={() => removeTarget("allow", target)} disabled={disabled}><Icon name="x" size={9} /></button></span>
        ))}
        {(normalized.deny ?? []).map((target) => (
          <span key={`deny-${target}`} className="tag deny">deny {target}<button type="button" onClick={() => removeTarget("deny", target)} disabled={disabled}><Icon name="x" size={9} /></button></span>
        ))}
        {!(normalized.allow?.length || normalized.deny?.length) ? <span className="muted">No custom domains.</span> : null}
      </div>
    </div>
  );
};

type TemplateDraft = {
  id: string;
  name: string;
  visibility: Template["visibility"];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  ports: number[];
  tags: string[];
  entrypoint: string[];
  runtimeFamily: string;
  egressPolicy: EgressPolicyInput;
  source: "dockerfile" | "image" | "clone";
  dockerfilePath: string;
  image: string;
  cloneSource?: string;
};

const generatedTemplateConfig = (draft: TemplateDraft) => [
  `name = ${tomlString(draft.name)}`,
  `id = ${tomlString(draft.id)}`,
  `visibility = ${tomlString(draft.visibility)}`,
  `runtime_family = ${tomlString(draft.runtimeFamily)}`,
  `cpu_count = ${draft.cpuCount}`,
  `memory_mb = ${draft.memoryMb}`,
  `workdir = ${tomlString(draft.workdir)}`,
  `ports = [${draft.ports.join(", ")}]`,
  draft.tags.length ? `tags = [${draft.tags.map(tomlString).join(", ")}]` : "",
  `egress_mode = ${tomlString(draft.egressPolicy.mode ?? "open")}`,
  (draft.egressPolicy.presets?.length ?? 0) > 0 ? `egress_presets = [${(draft.egressPolicy.presets ?? []).map(tomlString).join(", ")}]` : "",
  (draft.egressPolicy.allow?.length ?? 0) > 0 ? `egress_allow = [${(draft.egressPolicy.allow ?? []).map(tomlString).join(", ")}]` : "",
  `start_command = ${tomlString(draft.entrypoint.join(" ") || "sleep 3600")}`,
  draft.source === "dockerfile" ? `dockerfile = ${tomlString(draft.dockerfilePath)}` : `image = ${tomlString(draft.image)}`,
  draft.cloneSource ? `clone_source = ${tomlString(draft.cloneSource)}` : ""
].filter(Boolean).join("\n");

const writeAscii = (target: Uint8Array, offset: number, length: number, value: string) => {
  for (let index = 0; index < Math.min(length, value.length); index += 1) target[offset + index] = value.charCodeAt(index);
};

const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, "0").slice(-(length - 1)) + "\0";

const makeTarGzipDockerfile = async (dockerfile: string) => {
  const compression = (globalThis as typeof globalThis & { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!compression) throw new Error("This browser cannot gzip build contexts. Use the CLI for Dockerfile builds.");
  const name = "Dockerfile";
  const file = new TextEncoder().encode(dockerfile);
  const fileBlocks = Math.ceil(file.length / 512);
  const tar = new Uint8Array(512 + fileBlocks * 512 + 1024);
  const header = tar.subarray(0, 512);
  writeAscii(header, 0, 100, name);
  writeAscii(header, 100, 8, octal(0o644, 8));
  writeAscii(header, 108, 8, octal(0, 8));
  writeAscii(header, 116, 8, octal(0, 8));
  writeAscii(header, 124, 12, octal(file.length, 12));
  writeAscii(header, 136, 12, octal(Math.floor(Date.now() / 1000), 12));
  for (let index = 148; index < 156; index += 1) header[index] = 32;
  header[156] = "0".charCodeAt(0);
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeAscii(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");
  tar.set(file, 512);
  const stream = new Blob([tar]).stream().pipeThrough(new compression("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = `sha256:${Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { archiveBase64: btoa(binary), sha256, sizeBytes: bytes.length };
};

const NewTemplateModal = ({
  templates,
  onClose,
  onCreate
}: {
  templates: Template[];
  onClose: () => void;
  onCreate: (template: Template, build?: TemplateBuildSummary | null) => void;
}) => {
  const [mode, setMode] = useState<TemplateDraft["source"]>("dockerfile");
  const [name, setName] = useState(() => `custom-template-${Date.now()}`);
  const [id, setId] = useState(() => slugifyTemplateId(`custom-template-${Date.now()}`));
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("Custom sandbox template.");
  const [visibility, setVisibility] = useState<Template["visibility"]>("private");
  const [cpuCount, setCpuCount] = useState(2);
  const [memoryMb, setMemoryMb] = useState(2048);
  const [workdir, setWorkdir] = useState("/workspace");
  const [ports, setPorts] = useState("3000, 5173");
  const [hotTemplate, setHotTemplate] = useState(false);
  const [entrypoint, setEntrypoint] = useState("sleep 3600");
  const [runtimeFamily, setRuntimeFamily] = useState("custom");
  const [egressPolicy, setEgressPolicy] = useState<EgressPolicyInput>(() => emptyEgressPolicy());
  const [image, setImage] = useState("ubuntu:24.04");
  const [dockerfile, setDockerfile] = useState(defaultDockerfile);
  const [cloneId, setCloneId] = useState(() => templates.find((template) => template.status !== "archived")?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedClone = templates.find((template) => template.id === cloneId);
  const parsedPorts = parseTemplatePorts(ports);
  const draft: TemplateDraft = {
    id: slugifyTemplateId(id),
    name: name.trim() || "Custom template",
    visibility,
    cpuCount,
    memoryMb,
    workdir: workdir.trim() || "/workspace",
    ports: parsedPorts,
    tags: Array.from(new Set(["custom", runtimeFamily.trim() || "custom", ...(hotTemplate ? ["hot"] : [])].filter(Boolean))),
    entrypoint: splitEntrypoint(entrypoint),
    runtimeFamily: runtimeFamily.trim() || "custom",
    egressPolicy: normalizeEgressPolicy(egressPolicy),
    source: mode,
    dockerfilePath: "Dockerfile",
    image: mode === "dockerfile" ? baseImageFromDockerfile(dockerfile) : mode === "clone" ? selectedClone?.image ?? image : image.trim(),
    cloneSource: mode === "clone" ? cloneId : undefined
  };

  useEffect(() => {
    if (mode !== "clone" || !selectedClone) return;
    const forkName = `${selectedClone.name} fork`;
    setName(forkName);
    if (!idTouched) setId(slugifyTemplateId(`${selectedClone.id}-fork`));
    setDescription(`Fork of ${selectedClone.id}.`);
    setCpuCount(selectedClone.cpuCount ?? 2);
    setMemoryMb(selectedClone.memoryMb ?? 2048);
    setWorkdir(selectedClone.workdir ?? "/workspace");
    setPorts((selectedClone.defaultPorts ?? []).join(", "));
    setHotTemplate((selectedClone.tags ?? []).some((tag) => ["hot", "prepull", "warm"].includes(tag.toLowerCase())));
    setRuntimeFamily(selectedClone.runtimeFamily ?? "custom");
    setEgressPolicy(normalizeEgressPolicy(selectedClone.egressPolicy));
    setImage(selectedClone.image);
    setEntrypoint((selectedClone.defaultEntrypoint ?? ["sleep", "3600"]).join(" "));
  }, [mode, cloneId, selectedClone, idTouched]);

  const updateName = (value: string) => {
    setName(value);
    if (!idTouched) setId(slugifyTemplateId(value));
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        id: draft.id,
        name: draft.name,
        description: description.trim() || "Custom sandbox template.",
        image: draft.image,
        icon: iconForRuntime(draft.runtimeFamily, draft.ports),
        tags: draft.tags,
        aliases: [draft.id],
        visibility: draft.visibility,
        defaultEntrypoint: draft.entrypoint.length ? draft.entrypoint : ["sleep", "3600"],
        cpuCount: draft.cpuCount,
        memoryMb: draft.memoryMb,
        workdir: draft.workdir,
        defaultPorts: draft.ports,
        runtimeFamily: draft.runtimeFamily,
        egressPolicy: draft.egressPolicy
      };
      const created = await api.createTemplate(payload);
      let build: TemplateBuildSummary | null = null;
      if (mode === "dockerfile") {
        const result = await api.createTemplateBuild(created.template.id, {
          sourceType: "dockerfile",
          dockerfilePath: "Dockerfile",
          metadata: { source: "dashboard", sourceKind: "dockerfile-upload" }
        });
        const context = await makeTarGzipDockerfile(dockerfile);
        await api.uploadTemplateBuildContext(result.build.id, {
          ...context,
          format: "tar+gzip",
          fileCount: 1,
          metadata: { source: "dashboard", file: "Dockerfile" }
        });
        build = (await api.templateBuild(result.build.id)).build;
      } else {
        const sourceImage = mode === "clone" ? selectedClone?.image ?? draft.image : draft.image;
        const result = await api.createTemplateBuild(created.template.id, {
          sourceType: "image",
          imageDestination: sourceImage,
          metadata: { source: "dashboard", sourceKind: mode === "clone" ? "template-clone" : "image-import", cloneSource: selectedClone?.id }
        });
        build = result.build;
      }
      onCreate(created.template, build);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal modal-template card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>New template</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12} /></button>
        </div>
        <div className="modal-body template-create-body">
          <div className="template-mode-tabs">
            {(["dockerfile", "image", "clone"] as const).map((item) => (
              <button key={item} className={`btn btn-sm ${mode === item ? "active" : ""}`} onClick={() => setMode(item)}>
                <Icon name={item === "dockerfile" ? "file" : item === "image" ? "box" : "copy"} size={12} /> {item === "dockerfile" ? "Dockerfile" : item === "image" ? "Image" : "Clone"}
              </button>
            ))}
          </div>
          <div className="template-create-grid">
            <div className="template-create-form">
              <div className="template-form-split">
                <Field label="Name"><input className="input" value={name} onChange={(event) => updateName(event.target.value)} /></Field>
                <Field label="ID"><input className="input mono" value={id} onChange={(event) => { setIdTouched(true); setId(slugifyTemplateId(event.target.value)); }} /></Field>
              </div>
              <Field label="Description"><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
              <div className="template-form-split three">
                <Field label="Visibility">
                  <select className="input" value={visibility} onChange={(event) => setVisibility(event.target.value as Template["visibility"])}>
                    <option value="private">private</option>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </select>
                </Field>
                <Field label="CPU"><input className="input mono" type="number" min={1} value={cpuCount} onChange={(event) => setCpuCount(Number(event.target.value))} /></Field>
                <Field label="Memory MB"><input className="input mono" type="number" min={128} value={memoryMb} onChange={(event) => setMemoryMb(Number(event.target.value))} /></Field>
              </div>
              <div className="template-form-split">
                <Field label="Workdir"><input className="input mono" value={workdir} onChange={(event) => setWorkdir(event.target.value)} /></Field>
                <Field label="Ports"><input className="input mono" value={ports} onChange={(event) => setPorts(event.target.value)} /></Field>
              </div>
              <div className="template-form-split">
                <Field label="Entrypoint"><input className="input mono" value={entrypoint} onChange={(event) => setEntrypoint(event.target.value)} /></Field>
                <Field label="Runtime"><input className="input mono" value={runtimeFamily} onChange={(event) => setRuntimeFamily(event.target.value)} /></Field>
              </div>
              <label className="template-check">
                <input type="checkbox" checked={hotTemplate} onChange={(event) => setHotTemplate(event.target.checked)} />
                <span>Hot image pre-pull</span>
              </label>
              {mode === "image" ? (
                <Field label="OCI image"><input className="input mono" value={image} onChange={(event) => setImage(event.target.value)} placeholder="ghcr.io/acme/agent-runtime:latest" /></Field>
              ) : null}
              {mode === "clone" ? (
                <Field label="Source template">
                  <select className="input" value={cloneId} onChange={(event) => setCloneId(event.target.value)}>
                    {templates.filter((template) => template.status !== "archived").map((template) => <option key={template.id} value={template.id}>{template.name} ({template.id})</option>)}
                  </select>
                </Field>
              ) : null}
              <Field label="Outbound access">
                <EgressPolicyControls policy={egressPolicy} onChange={setEgressPolicy} disabled={loading} />
              </Field>
              {mode === "dockerfile" ? (
                <>
                  <Field label="Dockerfile">
                    <input
                      className="input"
                      type="file"
                      accept=".dockerfile,Dockerfile,text/plain"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void file.text().then(setDockerfile);
                      }}
                    />
                  </Field>
                  <textarea className="input template-dockerfile mono" spellCheck={false} value={dockerfile} onChange={(event) => setDockerfile(event.target.value)} />
                </>
              ) : null}
            </div>
            <div className="template-preview">
              <div className="template-preview-head"><span>harakiri.toml</span><button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(generatedTemplateConfig(draft))}><Icon name="copy" size={12} /></button></div>
              <pre>{generatedTemplateConfig(draft)}</pre>
              <div className="template-preview-meta">
                <span><b>{draft.source}</b> source</span>
                <span>{draft.ports.length ? `${draft.ports.length} ports` : "no default ports"}</span>
                <span>{draft.source === "dockerfile" ? `base ${draft.image}` : draft.image}</span>
              </div>
            </div>
          </div>
          {error ? <div className="template-error">{error}</div> : null}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-ghost" onClick={() => openDocsPage("custom-templates")}>Docs</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !draft.id || !draft.name}>
            {loading ? <><span className="spinner" /> Creating...</> : <>Create template <Icon name="arrowR" size={11} /></>}
          </button>
        </div>
      </div>
    </div>
  );
};

const shortDigest = (value?: string | null) => value ? value.replace(/^sha256:/, "").slice(0, 12) : "-";
const buildDuration = (build: TemplateBuildSummary) => {
  const start = build.startedAt ?? build.createdAt;
  const end = build.completedAt ?? null;
  if (!start || !end) return "-";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};
const buildResultLabel = (build: TemplateBuildSummary) => {
  if (build.error) return build.error;
  return shortDigest(build.imageDigest);
};
const buildIsActive = (build: TemplateBuildSummary) => build.status === "queued" || build.status === "building";
const templateCanRun = (template: Template) => template.status === "ready" && Boolean(template.latestVersionId);
const buildFailureSummary = (build: TemplateBuildSummary) => {
  if (build.status !== "failed") return null;
  const message = build.error ?? "Build failed before the builder returned a specific error.";
  const lower = message.toLowerCase();
  if (lower.includes("template_image_policy_violation") || lower.includes("image policy") || lower.includes("registry_not_allowed")) {
    return {
      title: "Image policy blocked this build",
      body: message,
      checks: ["Use an allowed registry or prefix.", "Open the Security model docs for the configured image policy.", "Retry after updating the image reference or workspace policy."]
    };
  }
  if (lower.includes("registry") || lower.includes("manifest lookup") || lower.includes("digest") || build.sourceType === "image") {
    return {
      title: "Registry lookup failed",
      body: message,
      checks: ["Confirm the image exists and the tag is public or credentials are configured.", "Check that the registry returns a sha256 manifest digest.", "Retry after fixing the image reference."]
    };
  }
  if (lower.includes("buildkit") || lower.includes("builder") || lower.includes("job") || lower.includes("dockerfile") || build.sourceType === "dockerfile") {
    return {
      title: "Dockerfile builder failed",
      body: message,
      checks: ["Open the build logs below first.", "Inspect the builder pod and container logs if this is a cluster issue.", "Retry after fixing the Dockerfile or base image."]
    };
  }
  return {
    title: "Build failed",
    body: message,
    checks: ["Read the retained logs below.", "Retry the build after correcting the source.", "Use the troubleshooting docs if the failure came from registry or route setup."]
  };
};
const metadataLabel = (value: unknown, fallback = "-") => {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value);
};
const templateRefForCreate = (template: Template) => template.aliases?.[0] ?? template.id;
const tomlArray = (values: Array<string | number>) => `[${values.map((value) => typeof value === "number" ? value : tomlString(value)).join(", ")}]`;
const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const templateConfigToml = (template: Template, latestBuild?: TemplateBuildSummary | null) => [
  `name = ${tomlString(template.name ?? template.id)}`,
  `id = ${tomlString(template.id)}`,
  `visibility = ${tomlString(template.visibility)}`,
  `runtime_family = ${tomlString(template.runtimeFamily ?? "custom")}`,
  `image = ${tomlString(template.image)}`,
  `cpu_count = ${template.cpuCount ?? 1}`,
  `memory_mb = ${template.memoryMb ?? 1024}`,
  `workdir = ${tomlString(template.workdir || "/")}`,
  `ports = ${tomlArray(template.defaultPorts ?? [])}`,
  `tags = ${tomlArray(template.tags ?? [])}`,
  `aliases = ${tomlArray(template.aliases ?? [])}`,
  `egress_mode = ${tomlString(template.egressPolicy?.mode ?? "open")}`,
  template.egressPolicy?.presets?.length ? `egress_presets = ${tomlArray(template.egressPolicy.presets)}` : null,
  template.egressPolicy?.allow?.length ? `egress_allow = ${tomlArray(template.egressPolicy.allow)}` : null,
  template.egressPolicy?.deny?.length ? `egress_deny = ${tomlArray(template.egressPolicy.deny)}` : null,
  `start_command = ${tomlString((template.defaultEntrypoint ?? ["sleep", "3600"]).join(" "))}`,
  latestBuild?.dockerfilePath ? `dockerfile = ${tomlString(latestBuild.dockerfilePath)}` : null
].filter(Boolean).join("\n");
const templateCreateCommand = (template: Template) => `harakiri create --template ${templateRefForCreate(template)} --name agent-runner`;
const templateSdkSnippet = (template: Template) => `import { HarakiriClient } from "@harakiri/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.PUBLIC_API_URL!,
  apiKey: process.env.HK_KEY!
});

const { sandbox } = await client.createSandbox({
  template: "${templateRefForCreate(template)}",
  ttlSeconds: 300
});

await client.run(sandbox.id, { command: "python --version" });`;
type TemplateDetailTab = "overview" | "versions" | "egress" | "config" | "runs";

export const TemplatesRoute = ({ openSandbox }: { openSandbox: (id: string) => void }) => {
  const [tab, setTab] = useState<"list" | "builds">("list");
  const [templates, setTemplates] = useState<Template[]>(TEMPLATES);
  const [templateTotal, setTemplateTotal] = useState(TEMPLATES.length);
  const [builds, setBuilds] = useState<TemplateBuildSummary[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [owner, setOwner] = useState("all");
  const [runtimeFamily, setRuntimeFamily] = useState("all");
  const [templateStatus, setTemplateStatus] = useState("active");
  const [buildQ, setBuildQ] = useState("");
  const [buildStatus, setBuildStatus] = useState("all");
  const [selectedBuild, setSelectedBuild] = useState<TemplateBuildSummary | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateDetailTab, setTemplateDetailTab] = useState<TemplateDetailTab>("overview");
  const [templateVersions, setTemplateVersions] = useState<TemplateVersionSummary[]>([]);
  const [templateDetailBuilds, setTemplateDetailBuilds] = useState<TemplateBuildSummary[]>([]);
  const [templateRuns, setTemplateRuns] = useState<SandboxSummary[]>([]);
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState("");
  const [buildLogs, setBuildLogs] = useState<TemplateBuildLogEntry[]>([]);
  const [buildLogsLoading, setBuildLogsLoading] = useState(false);
  const [buildLogsError, setBuildLogsError] = useState("");
  const [buildsLoading, setBuildsLoading] = useState(false);
  const [buildsError, setBuildsError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const loadTemplates = async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (visibility !== "all") params.set("visibility", visibility);
    if (owner !== "all") params.set("owner", owner);
    if (runtimeFamily !== "all") params.set("runtimeFamily", runtimeFamily);
    if (templateStatus !== "active") params.set("status", templateStatus);
    params.set("limit", "100");
    try {
      const result = await api.templates(`?${params.toString()}`);
      setTemplates(result.templates);
      setTemplateTotal(result.page?.total ?? result.templates.length);
    } catch {
      // Keep the bootstrap catalog visible if the API is temporarily unavailable.
    }
  };
  const loadBuilds = async () => {
    const params = new URLSearchParams();
    if (buildQ.trim()) params.set("q", buildQ.trim());
    if (buildStatus !== "all") params.set("status", buildStatus);
    const query = params.toString();
    setBuildsLoading(true);
    setBuildsError("");
    try {
      const result = await api.templateBuilds(query ? `?${query}` : "");
      setBuilds(result.builds);
    } catch (error) {
      setBuildsError(error instanceof Error ? error.message : "Failed to load builds.");
      setBuilds([]);
    } finally {
      setBuildsLoading(false);
    }
  };
  useEffect(() => { void loadTemplates(); }, [q, visibility, owner, runtimeFamily, templateStatus]);
  useEffect(() => { void loadBuilds(); }, [buildQ, buildStatus]);
  useEffect(() => { api.usage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => {
    if (!templates.length) {
      if (selectedTemplate) setSelectedTemplate(null);
      return;
    }
    if (!selectedTemplate || !templates.some((template) => template.id === selectedTemplate.id)) {
      setSelectedTemplate(templates[0]);
    }
  }, [templates, selectedTemplate?.id]);
  useEffect(() => {
    if (!selectedBuild) {
      setBuildLogs([]);
      setBuildLogsError("");
      setBuildLogsLoading(false);
      return;
    }
    let cancelled = false;
    setBuildLogsLoading(true);
    setBuildLogsError("");
    api.templateBuildLogs(selectedBuild.id)
      .then((r) => { if (!cancelled) setBuildLogs(r.logs); })
      .catch((error) => {
        if (!cancelled) {
          setBuildLogs([]);
          setBuildLogsError(error instanceof Error ? error.message : "Failed to load build logs.");
        }
      })
      .finally(() => { if (!cancelled) setBuildLogsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBuild]);
  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateVersions([]);
      setTemplateDetailBuilds([]);
      setTemplateRuns([]);
      setTemplateDetailError("");
      setTemplateDetailLoading(false);
      return;
    }
    let cancelled = false;
    const templateId = selectedTemplate.id;
    setTemplateDetailLoading(true);
    setTemplateDetailError("");
    const params = new URLSearchParams({ template: templateId, limit: "20" });
    Promise.all([
      api.template(templateId),
      api.templateVersions(templateId),
      api.templateBuilds(`?${params.toString()}`),
      api.sandboxes(`?${params.toString()}`)
    ])
      .then(([templateResult, versionResult, buildResult, sandboxResult]) => {
        if (cancelled) return;
        setSelectedTemplate(templateResult.template);
        setTemplateVersions(versionResult.versions);
        setTemplateDetailBuilds(buildResult.builds);
        setTemplateRuns(sandboxResult.sandboxes);
      })
      .catch((error) => {
        if (cancelled) return;
        setTemplateVersions([]);
        setTemplateDetailBuilds([]);
        setTemplateRuns([]);
        setTemplateDetailError(error instanceof Error ? error.message : "Failed to load template details.");
      })
      .finally(() => { if (!cancelled) setTemplateDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTemplate?.id]);

  const buildCounts = useMemo(() => ({
    all: builds.length,
    queued: builds.filter((build) => build.status === "queued").length,
    building: builds.filter((build) => build.status === "building").length,
    success: builds.filter((build) => build.status === "success").length,
    failed: builds.filter((build) => build.status === "failed").length,
    canceled: builds.filter((build) => build.status === "canceled").length
  }), [builds]);

  const createFromTemplate = async (templateId: string) => {
    setBusy(`use:${templateId}`);
    try {
      const result = await api.createSandbox({ template: templateId, ttlSeconds: 300, name: `${templateId}-runner` });
      openSandbox(result.sandbox.id);
    } finally {
      setBusy(null);
    }
  };
  const queueBuild = async (template: Template) => {
    setBusy(`build:${template.id}`);
    try {
      const result = await api.createTemplateBuild(template.id, { sourceType: "image", imageDestination: template.image });
      setSelectedBuild(result.build);
      setTab("builds");
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };
  const viewBuilds = (templateId: string) => {
    setBuildQ(templateId);
    setBuildStatus("all");
    setSelectedBuild(null);
    setTab("builds");
  };
  const viewTemplate = (template: Template, detailTab: TemplateDetailTab = "overview") => {
    setSelectedTemplate(template);
    setTemplateDetailTab(detailTab);
  };
  const promoteTemplate = async (template: Template) => {
    if (!template.latestVersionId) return;
    setBusy(`promote:${template.id}`);
    try {
      const result = await api.promoteTemplateVersion(template.id, { versionId: template.latestVersionId, alias: "stable" });
      if (selectedTemplate?.id === template.id) setSelectedTemplate(result.template);
      await loadTemplates();
    } finally {
      setBusy(null);
    }
  };
  const retryBuild = async (id: string) => {
    setBusy(`retry:${id}`);
    try {
      const result = await api.retryTemplateBuild(id);
      setSelectedBuild(result.build);
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };
  const cancelBuild = async (id: string) => {
    setBusy(`cancel:${id}`);
    try {
      const result = await api.cancelTemplateBuild(id);
      setSelectedBuild(result.build);
      await loadBuilds();
    } finally {
      setBusy(null);
    }
  };
  const archiveTemplate = async (templateId: string) => {
    setBusy(`archive:${templateId}`);
    try {
      const result = await api.archiveTemplate(templateId);
      if (selectedTemplate?.id === templateId) setSelectedTemplate(result.template);
      await loadTemplates();
    } finally {
      setBusy(null);
    }
  };
  const handleTemplateCreated = (template: Template, build?: TemplateBuildSummary | null) => {
    setShowNewTemplate(false);
    setQ(template.id);
    setOwner("team");
    setVisibility("all");
    setRuntimeFamily("all");
    setTemplateStatus("active");
    setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
    if (build) {
      setBuildQ(template.id);
      setSelectedBuild(build);
      setBuilds((current) => [build, ...current.filter((item) => item.id !== build.id)]);
      setTab("builds");
    } else {
      setSelectedTemplate(template);
      setTemplateDetailTab("overview");
      setTab("list");
    }
    void loadTemplates();
  };

  return (
    <div className="dash-page tmpl-workspace">
      <div className="tmpl-topline">
        <div>
          <h1 className="page-h">Templates</h1>
          <div className="tmpl-tabs">
            <button className={`tmpl-tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}><Icon name="logs" size={13} /> List</button>
            <button className={`tmpl-tab ${tab === "builds" ? "active" : ""}`} onClick={() => setTab("builds")}><Icon name="settings" size={13} /> Builds</button>
          </div>
        </div>
        <div className="tmpl-live">
          <button className="btn btn-ghost btn-sm" onClick={() => { loadTemplates(); loadBuilds(); void api.usage().then(setUsage); }}><Icon name="refresh" size={12} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewTemplate(true)}><Icon name="plus" size={12} /> New template</button>
          <span className="pill live"><span className="dot" /> live</span>
          <span className="num">{usage?.concurrentNow ?? 0}</span>
          <span className="tmpl-live-label">concurrent sandboxes</span>
        </div>
      </div>

      {tab === "list" ? (
        <>
          <div className="tmpl-toolbar">
            <div className="search-input tmpl-search"><Icon name="search" size={12} /><input placeholder="Search by name or ID..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className={`btn btn-sm ${visibility === "all" ? "active" : ""}`} onClick={() => setVisibility("all")}>All</button>
            <button className={`btn btn-sm ${visibility === "internal" ? "active" : ""}`} onClick={() => setVisibility("internal")}>Internal</button>
            <button className={`btn btn-sm ${visibility === "public" ? "active" : ""}`} onClick={() => setVisibility("public")}>Public</button>
            <button className={`btn btn-sm ${visibility === "private" ? "active" : ""}`} onClick={() => setVisibility("private")}>Private</button>
            <select className="input tmpl-filter-select" aria-label="Owner filter" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">All owners</option>
              <option value="team">Team</option>
              <option value="platform">Platform</option>
            </select>
            <select className="input tmpl-filter-select" aria-label="Runtime filter" value={runtimeFamily} onChange={(e) => setRuntimeFamily(e.target.value)}>
              <option value="all">All runtimes</option>
              <option value="python">Python</option>
              <option value="python-data">Python data</option>
              <option value="node">Node</option>
              <option value="browser">Browser</option>
              <option value="linux">Linux</option>
              <option value="custom">Custom</option>
            </select>
            <button className={`btn btn-sm ${templateStatus === "active" ? "active" : ""}`} onClick={() => setTemplateStatus("active")}>Active</button>
            <button className={`btn btn-sm ${templateStatus === "archived" ? "active" : ""}`} onClick={() => setTemplateStatus("archived")}>Archived</button>
            <button className={`btn btn-sm ${templateStatus === "all" ? "active" : ""}`} onClick={() => setTemplateStatus("all")}>All status</button>
            <span className="tmpl-total num">{templateTotal} total</span>
          </div>
          <div className="tmpl-list-layout">
            <div className="tmpl-list card">
              <div className="tmpl-row tmpl-head"><span>Name</span><span>Resources</span><span>Updated</span><span>Visibility</span><span>Build</span><span>Version</span><span /></div>
              {templates.map((template) => (
                <div
                  className={`tmpl-row ${selectedTemplate?.id === template.id ? "active" : ""}`}
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => viewTemplate(template)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      viewTemplate(template);
                    }
                  }}
                >
                  <span className="tmpl-main-name">
                    <b>{template.name}</b>
                    <small><span className="num">{template.id}</span> - {template.ownerScope === "team" ? "team" : "platform"}{template.runtimeFamily ? ` - ${template.runtimeFamily}` : ""} - {template.description}</small>
                  </span>
                  <span className="tmpl-resource"><b>{template.cpuCount ?? 1} cores</b><small>{template.memoryMb?.toLocaleString() ?? 1024} MB</small></span>
                  <span className="num muted">{formatDateTime(template.updatedAt)}</span>
                  <span><span className={`tag ${template.visibility === "internal" ? "tag-lock" : ""}`}>{template.visibility === "internal" ? <Icon name="lock" size={10} /> : null}{template.visibility}</span>{template.status !== "ready" ? <span className="tag" style={{ marginLeft: 4 }}>{template.status}</span> : null}</span>
                  <span>{template.latestBuildStatus ? <span className={`build-badge ${template.latestBuildStatus}`} title={template.latestBuildId ?? undefined}>{template.latestBuildStatus}</span> : <span className="num muted">-</span>}</span>
                  <span className="num muted">{shortDigest(template.imageDigest ?? template.latestVersionId)}</span>
                  <span className="tmpl-actions">
                    <button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); viewTemplate(template); }}>Open</button>
                    <button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); void createFromTemplate(template.id); }} disabled={!templateCanRun(template) || busy === `use:${template.id}`} title={templateCanRun(template) ? "Create a sandbox" : "Build a ready template version first"}>Use</button>
                  </span>
                </div>
              ))}
              {templates.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">No templates found.</div><div className="sbx-empty-sub">Clear filters or create a template from the dashboard.</div><div className="sbx-empty-actions"><button className="btn btn-primary btn-sm" onClick={() => setShowNewTemplate(true)}><Icon name="plus" size={12} /> New template</button><button className="btn btn-sm" onClick={() => openDocsPage("custom-templates")}>Docs</button></div></div>}
            </div>
            <TemplateDetailPanel
              template={selectedTemplate}
              tab={templateDetailTab}
              onTab={setTemplateDetailTab}
              versions={templateVersions}
              builds={templateDetailBuilds}
              runs={templateRuns}
              loading={templateDetailLoading}
              error={templateDetailError}
              busy={busy}
              onUse={createFromTemplate}
              onBuild={queueBuild}
              onViewBuilds={viewBuilds}
              onPromote={promoteTemplate}
              onArchive={archiveTemplate}
              onOpenSandbox={openSandbox}
              onTemplateUpdated={(template) => {
                setSelectedTemplate(template);
                setTemplates((current) => current.map((item) => item.id === template.id ? template : item));
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="tmpl-toolbar build-toolbar">
            <div className="search-input tmpl-search"><Icon name="search" size={12} /><input placeholder="Build ID, Template ID or Name" value={buildQ} onChange={(e) => setBuildQ(e.target.value)} /></div>
            {(["all", "queued", "building", "success", "failed", "canceled"] as const).map((status) => (
              <button key={status} className={`btn btn-sm ${buildStatus === status ? "active" : ""}`} onClick={() => setBuildStatus(status)}>
                {status} <span className="filter-count">{buildCounts[status]}</span>
              </button>
            ))}
          </div>
          <div className="tmpl-build-layout">
            <div className="tmpl-builds card">
              <div className="build-row build-head"><span>Status</span><span>Template</span><span>Started</span><span>Duration</span><span>ID</span><span>Version</span><span>Result</span><span /></div>
              {buildsError ? <div className="build-inline-alert"><span>{buildsError}</span><button className="btn btn-ghost btn-sm" onClick={() => openDocsPage("template-troubleshooting")}>Docs</button></div> : null}
              {builds.map((build) => (
                <div
                  className={`build-row ${selectedBuild?.id === build.id ? "active" : ""}`}
                  key={build.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBuild(build)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBuild(build);
                    }
                  }}
                >
                  <span><span className={`build-badge ${build.status}`}>{build.status}</span></span>
                  <span>{build.templateId}</span>
                  <span className="num muted">{formatDateTime(build.startedAt ?? build.createdAt)}</span>
                  <span className="num">{buildDuration(build)}</span>
                  <span className="num muted">{build.id}</span>
                  <span className="num muted">{shortDigest(build.resultVersionId)}</span>
                  <span className="muted">{buildResultLabel(build)}</span>
                  <span className="tmpl-actions">
                    {buildIsActive(build) ? <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void cancelBuild(build.id); }} disabled={busy === `cancel:${build.id}`}>Cancel</button> : null}
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void retryBuild(build.id); }} disabled={busy === `retry:${build.id}`}>Retry</button>
                  </span>
                </div>
              ))}
              {builds.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">{buildsLoading ? "Loading builds..." : "No builds found."}</div><div className="sbx-empty-sub">{buildsLoading ? "Fetching retained build records and logs." : "Queue a build from the List tab or create a template."}</div>{buildsLoading ? null : <div className="sbx-empty-actions"><button className="btn btn-primary btn-sm" onClick={() => setShowNewTemplate(true)}><Icon name="plus" size={12} /> New template</button><button className="btn btn-sm" onClick={() => openDocsPage("template-builds")}>Docs</button></div>}</div>}
            </div>
            <div className="build-detail card">
              {selectedBuild ? (
                <>
                  <div className="build-detail-head"><div><div className="card-h">Build details</div><div className="num muted">{selectedBuild.id}</div></div><span className={`build-badge ${selectedBuild.status}`}>{selectedBuild.status}</span></div>
                  <div className="build-meta">
                    <span>Template <b>{selectedBuild.templateId}</b></span>
                    <span>Version <b>{selectedBuild.resultVersionId ?? "pending"}</b></span>
                    <span>Dockerfile <b>{selectedBuild.dockerfilePath ?? "Dockerfile"}</b></span>
                    <span>Image <b>{selectedBuild.imageDestination ?? "pending"}</b></span>
                    <span>Builder <b>{metadataLabel(selectedBuild.metadata?.builder ?? selectedBuild.metadata?.source ?? selectedBuild.sourceType)}</b></span>
                    <span>Builder pod <b>{metadataLabel(selectedBuild.metadata?.builderPodName)}</b></span>
                    <span>Node <b>{metadataLabel(selectedBuild.metadata?.builderNodeName)}</b></span>
                    <span>Pull preflight <b>{metadataLabel((selectedBuild.metadata?.runtimePullPreflight as Record<string, unknown> | undefined)?.status)}</b></span>
                    <span>Image pre-pull <b>{metadataLabel((selectedBuild.metadata?.runtimeImagePrepull as Record<string, unknown> | undefined)?.status)}</b></span>
                    <span>Context <b>{selectedBuild.context ? `${selectedBuild.context.sha256} - ${formatBytes(selectedBuild.context.sizeBytes)} - ${selectedBuild.context.fileCount ?? 0} files` : selectedBuild.contextHash ?? "-"}</b></span>
                  </div>
                  {buildIsActive(selectedBuild) ? <div className="build-progress-note"><span className="spinner" /> {selectedBuild.status === "queued" ? "Waiting for the builder to claim this record." : "Builder is running. Refresh to pull the latest status and logs."}</div> : null}
                  {(() => {
                    const failure = buildFailureSummary(selectedBuild);
                    return failure ? (
                      <div className="build-failure-panel">
                        <div>
                          <div className="build-failure-title">{failure.title}</div>
                          <div className="build-failure-body">{failure.body}</div>
                          <ul>{failure.checks.map((check) => <li key={check}>{check}</li>)}</ul>
                        </div>
                        <div className="build-failure-actions">
                          <button className="btn btn-sm" onClick={() => void retryBuild(selectedBuild.id)} disabled={busy === `retry:${selectedBuild.id}`}>Retry</button>
                          <button className="btn btn-sm" onClick={() => openDocsPage("template-troubleshooting")}>Docs</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(failure.body)} title="Copy error"><Icon name="copy" size={12} /></button>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div className="build-log">
                    {buildLogsLoading ? <div className="muted">Loading build logs...</div> : buildLogsError ? <div className="muted">{buildLogsError}</div> : buildLogs.length ? buildLogs.map((line) => <div key={line.lineNo}><span className="num">{line.lineNo}</span><span>{line.message}</span></div>) : <div className="muted">{selectedBuild.status === "failed" ? "No retained build logs were recorded before failure." : "No build logs yet. The builder worker has not started this record."}</div>}
                  </div>
                </>
              ) : (
                <div className="sbx-empty"><div className="sbx-empty-title">Select a build.</div><div className="sbx-empty-sub">Logs and result metadata appear here.</div></div>
              )}
            </div>
          </div>
        </>
      )}
      {showNewTemplate ? <NewTemplateModal templates={templates} onClose={() => setShowNewTemplate(false)} onCreate={handleTemplateCreated} /> : null}
    </div>
  );
};

const TemplateEgressSection = ({
  template,
  mutable,
  onUpdated
}: {
  template: Template;
  mutable: boolean;
  onUpdated: (template: Template) => void;
}) => {
  const [policy, setPolicy] = useState<EgressPolicyInput>(() => normalizeEgressPolicy(template.egressPolicy));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setPolicy(normalizeEgressPolicy(template.egressPolicy));
    setMessage("");
  }, [template.id, template.egressPolicy]);
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await api.updateTemplateEgress(template.id, { egressPolicy: normalizeEgressPolicy(policy) });
      onUpdated(result.template);
      setMessage("Template default updated. New sandboxes inherit this policy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update outbound access.");
    } finally {
      setSaving(false);
    }
  };
  const inheritedCount = (policy.presets?.length ?? 0) + (policy.allow?.length ?? 0) + (policy.deny?.length ?? 0);
  return (
    <div className="template-detail-section">
      <div className="template-egress-head">
        <div>
          <div className="field-l">Template default</div>
          <div className="template-detail-sub">Applied when a sandbox is created from this template unless the user overrides it.</div>
        </div>
        <div className="egress-status-row">
          <span className={`pill ${policy.mode === "restricted" ? "idle" : policy.mode === "blocked" ? "" : "live"}`}><span className="dot" /> {policy.mode ?? "open"}</span>
          <span className="tag">{inheritedCount} rules</span>
        </div>
      </div>
      <EgressPolicyControls policy={policy} onChange={setPolicy} disabled={!mutable || saving} />
      {message ? <div className={`template-egress-message ${message.includes("updated") ? "ok" : ""}`}>{message}</div> : null}
      <div className="template-detail-actions-row">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!mutable || saving}>{saving ? <><span className="spinner" /> Saving</> : "Save outbound default"}</button>
        <button className="btn btn-sm" onClick={() => setPolicy(emptyEgressPolicy())} disabled={!mutable || saving}>Reset to open</button>
        <button className="btn btn-ghost btn-sm" onClick={() => openDocsPage("egress-control")}>Docs</button>
      </div>
      {!mutable ? <div className="template-egress-message">Platform and archived templates are read-only. Fork or create a team template to change the default.</div> : null}
    </div>
  );
};

const TemplateDetailPanel = ({
  template,
  tab,
  onTab,
  versions,
  builds,
  runs,
  loading,
  error,
  busy,
  onUse,
  onBuild,
  onViewBuilds,
  onPromote,
  onArchive,
  onOpenSandbox,
  onTemplateUpdated
}: {
  template: Template | null;
  tab: TemplateDetailTab;
  onTab: (tab: TemplateDetailTab) => void;
  versions: TemplateVersionSummary[];
  builds: TemplateBuildSummary[];
  runs: SandboxSummary[];
  loading: boolean;
  error: string;
  busy: string | null;
  onUse: (id: string) => Promise<void>;
  onBuild: (template: Template) => Promise<void>;
  onViewBuilds: (templateId: string) => void;
  onPromote: (template: Template) => Promise<void>;
  onArchive: (templateId: string) => Promise<void>;
  onOpenSandbox: (id: string) => void;
  onTemplateUpdated: (template: Template) => void;
}) => {
  if (!template) {
    return (
      <div className="template-detail-panel card">
        <div className="sbx-empty">
          <div className="sbx-empty-title">Open a template.</div>
          <div className="sbx-empty-sub">Select Open on a row to inspect commands, versions, config, and recent runs.</div>
          <div className="sbx-empty-actions"><button className="btn btn-sm" onClick={() => openDocsPage("custom-templates")}>Docs</button></div>
        </div>
      </div>
    );
  }

  const latestBuild = builds[0] ?? null;
  const canBuild = template.status !== "archived" && template.ownerScope === "team";
  const canPromote = template.status !== "archived" && template.visibility === "private" && Boolean(template.latestVersionId);
  const canArchive = template.status !== "archived" && template.visibility === "private";
  return (
    <div className="template-detail-panel card">
      <div className="template-detail-head">
        <div>
          <div className="card-h">Template detail</div>
          <div className="template-detail-title">{template.name}</div>
          <div className="template-detail-sub num">{template.id}</div>
        </div>
        <div className="template-detail-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(template.id)} title="Copy template ID"><Icon name="copy" size={12} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => void onUse(template.id)} disabled={!templateCanRun(template) || busy === `use:${template.id}`} title={templateCanRun(template) ? "Create a sandbox" : "Build a ready template version first"}>Use</button>
        </div>
      </div>

      <div className="template-detail-tabs">
        {(["overview", "versions", "egress", "config", "runs"] as const).map((item) => (
          <button key={item} className={`template-detail-tab ${tab === item ? "active" : ""}`} onClick={() => onTab(item)}>{item}</button>
        ))}
      </div>

      <div className="template-detail-actions-row template-detail-primary-actions">
        <button className="btn btn-sm" onClick={() => void onBuild(template)} disabled={!canBuild || busy === `build:${template.id}`} title={canBuild ? "Queue a build" : "Builds are available for team templates"}>Queue build</button>
        <button className="btn btn-sm" onClick={() => onViewBuilds(template.id)}>Builds</button>
        {canPromote ? <button className="btn btn-sm" onClick={() => void onPromote(template)} disabled={busy === `promote:${template.id}`}>Promote</button> : null}
        {canArchive ? <button className="btn btn-sm" onClick={() => void onArchive(template.id)} disabled={busy === `archive:${template.id}`}>Archive</button> : null}
        <button className="btn btn-ghost btn-sm" onClick={() => openDocsPage("custom-templates")}>Docs</button>
      </div>

      {loading ? <div className="build-progress-note"><span className="spinner" /> Loading template control-plane data.</div> : null}
      {error ? <div className="build-inline-alert template-detail-alert"><span>{error}</span><button className="btn btn-ghost btn-sm" onClick={() => openDocsPage("template-troubleshooting")}>Docs</button></div> : null}

      {tab === "overview" ? (
        <div className="template-detail-section">
          <div className="template-detail-kpis">
            <div><span>CPU</span><b>{template.cpuCount ?? 1} cores</b></div>
            <div><span>Memory</span><b>{(template.memoryMb ?? 1024).toLocaleString()} MB</b></div>
            <div><span>Visibility</span><b>{template.visibility}</b></div>
            <div><span>Status</span><b>{template.status}</b></div>
          </div>
          <div className="template-detail-meta">
            <span>Image <b>{template.image}</b></span>
            <span>Digest <b>{template.imageDigest ?? "pending"}</b></span>
            <span>Latest version <b>{template.latestVersionId ?? "pending"}</b></span>
            <span>Workdir <b>{template.workdir || "/"}</b></span>
            <span>Entrypoint <b>{(template.defaultEntrypoint ?? []).join(" ") || "-"}</b></span>
            <span>Ports <b>{template.defaultPorts?.length ? template.defaultPorts.join(", ") : "none"}</b></span>
          </div>
          <div className="template-code-block">
            <div className="template-code-head"><span>Create command</span><button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(templateCreateCommand(template))}><Icon name="copy" size={12} /></button></div>
            <pre>{templateCreateCommand(template)}</pre>
          </div>
          <div className="template-code-block">
            <div className="template-code-head"><span>JavaScript SDK</span><button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(templateSdkSnippet(template))}><Icon name="copy" size={12} /></button></div>
            <pre>{templateSdkSnippet(template)}</pre>
          </div>
        </div>
      ) : null}

      {tab === "versions" ? (
        <div className="template-detail-section">
          {versions.map((version) => (
            <div className="template-version-row" key={version.id}>
              <div>
                <div className="template-version-title"><span className="num">{version.id}</span>{version.id === template.latestVersionId ? <span className="tag">latest</span> : null}{version.aliases.map((alias) => <span className="tag" key={alias}>{alias}</span>)}</div>
                <div className="template-version-sub">{version.imageUri}</div>
                <div className="template-version-sub">digest {version.imageDigest ?? "pending"} - scan {version.scanStatus}</div>
              </div>
              <div className="template-version-side">
                <span className={`build-badge ${version.status}`}>{version.status}</span>
                <span className="num muted">v{version.versionNumber}</span>
                <span className="num muted">{formatDateTime(version.createdAt)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(version.id)}><Icon name="copy" size={12} /></button>
              </div>
            </div>
          ))}
          {versions.length ? null : <div className="empty-state">No versions have been recorded for this template yet.</div>}
        </div>
      ) : null}

      {tab === "egress" ? (
        <TemplateEgressSection
          template={template}
          mutable={canBuild}
          onUpdated={onTemplateUpdated}
        />
      ) : null}

      {tab === "config" ? (
        <div className="template-detail-section">
          <div className="template-code-block">
            <div className="template-code-head"><span>harakiri.toml</span><button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(templateConfigToml(template, latestBuild))}><Icon name="copy" size={12} /></button></div>
            <pre>{templateConfigToml(template, latestBuild)}</pre>
          </div>
          <div className="template-config-grid">
            <div>
              <div className="field-l">Latest build</div>
              <div className="template-detail-meta compact">
                <span>ID <b>{latestBuild?.id ?? "-"}</b></span>
                <span>Source <b>{latestBuild?.sourceType ?? "-"}</b></span>
                <span>Status <b>{latestBuild?.status ?? "-"}</b></span>
                <span>Dockerfile <b>{latestBuild?.dockerfilePath ?? "Dockerfile"}</b></span>
              </div>
            </div>
            <div>
              <div className="field-l">Redacted build args</div>
              <pre className="template-json">{formatJson(latestBuild?.buildArgs ?? {})}</pre>
            </div>
            <div>
              <div className="field-l">Redacted metadata</div>
              <pre className="template-json">{formatJson(latestBuild?.metadata ?? {})}</pre>
            </div>
          </div>
          <div className="template-detail-actions-row">
            <button className="btn btn-sm" onClick={() => void onBuild(template)} disabled={!canBuild || busy === `build:${template.id}`}>Queue build</button>
            <button className="btn btn-sm" onClick={() => onViewBuilds(template.id)}>View builds</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openDocsPage("custom-templates")}>Docs</button>
          </div>
        </div>
      ) : null}

      {tab === "runs" ? (
        <div className="template-detail-section">
          <div className="template-run-list">
            {runs.map((run) => (
              <div className="template-run-row" key={run.id}>
                <div>
                  <div className="template-run-title">{run.name}<span className="num muted">{run.id}</span></div>
                  <div className="template-run-sub">version {run.templateVersionId ?? "unversioned"} - digest {shortDigest(run.templateImageDigest)}</div>
                </div>
                <span className={`pill ${run.status === "running" ? "live" : ""}`}><span className="dot" /> {run.status}</span>
                <span className="num muted">{formatDateTime(run.createdAt)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenSandbox(run.id)}>Open <Icon name="arrowR" size={11} /></button>
              </div>
            ))}
            {runs.length ? null : <div className="empty-state">No recent sandboxes were created from this template.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
};

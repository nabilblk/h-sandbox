import { useId } from "react";
import { Icon } from "./icon";

const Connector = ({ children }: { children: string }) => <div className="diagram-connector"><span>{children}</span></div>;

export function ArchitectureDiagram() {
  const id = useId();
  return <figure className="docs-diagram system-diagram" aria-labelledby={`${id}-title`}>
    <div className="diagram-heading"><span>01 / System map</span><strong id={`${id}-title`}>One contract. Three clear responsibilities.</strong></div>
    <div className="system-map">
      <div className="diagram-node diagram-client" data-diagram-node>
        <div className="diagram-node-heading"><Icon name="terminal" size={19} /><strong>Your application</strong><span>Task orchestration</span></div>
        <div className="diagram-entrypoints"><span>TypeScript SDK</span><span>CLI</span><span>Dashboard</span><span>HTTP API</span></div>
      </div>
      <Connector>Authenticated Harakiri API</Connector>
      <div className="diagram-node diagram-control" data-diagram-node>
        <div className="diagram-node-heading"><span className="diagram-brand">h.</span><strong>Harakiri control plane</strong><span>Access, policy and lifecycle</span></div>
        <dl className="diagram-responsibilities">
          <div><dt>Authorize</dt><dd>Organizations, API keys, credentials</dd></div>
          <div><dt>Prepare</dt><dd>Templates, versions, image builds</dd></div>
          <div><dt>Coordinate</dt><dd>Sandbox records, TTL, workspace reservations</dd></div>
          <div><dt>Expose</dt><dd>Commands, files, routes, policy diagnostics</dd></div>
        </dl>
        <div className="diagram-dependencies"><span><strong>Keycloak</strong> identity verification</span><span><strong>PostgreSQL</strong> product metadata</span></div>
      </div>
      <Connector>RuntimeProvider contract</Connector>
      <div className="diagram-node diagram-runtime" data-diagram-node>
        <div className="diagram-node-heading"><Icon name="box" size={19} /><strong>Runtime provider</strong><span>OpenSandbox adapter today</span></div>
        <div className="diagram-runtime-detail"><span>Sandbox lifecycle</span><span>Commands and filesystem</span><span>Network enforcement</span></div>
        <div className="diagram-runtime-foot"><span>Isolated sandbox processes</span><span>Optional workspace volume</span></div>
      </div>
      <div className="diagram-foundation"><Icon name="settings" /><span><strong>Operator-managed infrastructure</strong> Kubernetes, registry, network and storage</span></div>
    </div>
    <figcaption>Harakiri owns the control-plane contract. The current runtime adapter uses OpenSandbox; additional adapters are not yet supported. PostgreSQL stores product state; workspace volumes store retained files. Applications never need sandbox pod access.</figcaption>
  </figure>;
}

export function TaskLifecycleDiagram() {
  const id = useId();
  const steps = [
    ["Prepare", "Template + task input", "Choose an image, lifetime and access policy."],
    ["Execute", "Disposable sandbox", "Run the agent and observe its commands."],
    ["Verify", "Files + test results", "Retrieve artifacts and check the outcome."],
    ["Release", "Terminate the runtime", "Keep only the results or retained workspace."]
  ];
  return <figure className="docs-diagram lifecycle-diagram" aria-labelledby={`${id}-title`}>
    <div className="diagram-heading"><span>02 / Task lifecycle</span><strong id={`${id}-title`}>A bounded runtime. An explicit result.</strong></div>
    <ol className="diagram-task-flow">{steps.map(([title, label, description], index) => <li key={title} data-diagram-node><span className="diagram-step-number">0{index + 1}</span><strong>{title}</strong><b>{label}</b><span>{description}</span></li>)}</ol>
    <div className="diagram-retention"><Icon name="folder" size={19} /><div><strong>Need to continue later?</strong><span>Retain a workspace. After release is confirmed, a replacement sandbox can attach to the same files.</span></div><span className="diagram-preview">0.5 preview</span></div>
    <figcaption>Retained files are not retained processes. Your application owns retries and acceptance checks; Harakiri owns the sandbox lifecycle and workspace reservation.</figcaption>
  </figure>;
}

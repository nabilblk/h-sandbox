import type { UserProfile } from "../auth";
import { BrandMark } from "../components/brand";
import { Icon } from "../components/icon";
import { TopNav } from "../components/top-nav";
import type { GoToRoute } from "./types";

export const LandingRoute = ({ go, profile, onSignIn, onSignOut, authStatus }: { go: GoToRoute; profile?: UserProfile | null; onSignIn: () => void; onSignOut: () => void; authStatus?: string }) => (
  <div className="landing">
    <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} authStatus={authStatus} active="landing" />
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-eyebrow"><BrandMark size={12} /><span>Sandbox control plane for agent runtimes</span><Icon name="arrowR" size={11} /></div>
        <h1 className="hero-h1">Harakiri Sandbox.<br /><span className="ink-red">Your sandbox</span><br />control plane.</h1>
        <p className="hero-sub">Give your agents a place to work. Manage environments, access, retained files and results through one API, SDK, CLI and dashboard. Self-hosted, open source, with runtime execution behind a provider interface.</p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => go("onboarding")}>Start building -&gt;</button>
          <button className="btn btn-lg" onClick={() => go("docs")}>Read the docs <Icon name="arrowR" size={12} /></button>
        </div>
        <div className="hero-meta">
          <span><Icon name="check" size={12} /> Apache-2.0</span>
          <span><Icon name="check" size={12} /> Self-hosted</span>
          <span><Icon name="check" size={12} /> Developer Preview</span>
        </div>
      </div>
      <HeroTerminal />
    </section>
    <section className="section">
      <div className="feat-grid">
        <Feature icon="bolt" title="One lifecycle" body="Create, run, renew, route, and terminate sandboxes through one control-plane API." />
        <Feature icon="lock" title="Explicit access" body="Organization permissions and scoped, expiring API keys define who can do what." />
        <Feature icon="terminal" title="CLI first" body="The same API powers the dashboard and the harakiri command-line workflow." />
        <Feature icon="folder" title="Retained work" body="Keep workspace files between disposable runtimes, with explicit attachment and release." />
        <Feature icon="globe" title="Network policy" body="Manage preview routes and outbound access with capability-aware enforcement." />
        <Feature icon="box" title="Provider boundary" body="OpenSandbox powers execution today. Runtime adapters stay behind the Harakiri contract." />
      </div>
    </section>
    <section className="cta"><div className="cta-inner"><h2 className="cta-h">Run the task. Verify the result. Release the runtime.</h2><button className="btn btn-primary btn-lg" onClick={() => go("docs/quickstart")}>Run your first task <Icon name="arrowR" size={12} /></button></div></section>
  </div>
);

const HeroTerminal = () => (
  <div className="hero-canvas">
    <div className="hterm hterm-brand card">
      <div className="hterm-bar"><span className="terminal-key">h.</span><span className="hterm-title">EXAMPLE WORKFLOW</span><a className="hterm-demo-link" href="#demos">Recorded demos</a></div>
      <div className="hterm-body">
        <div className="terminal-brand-banner"><BrandMark size={68} /></div>
        <div className="hterm-line">$ <em>harakiri</em> init</div>
        <div className="hterm-line muted">Connect to your installation.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
        <div className="terminal-sep" />
        <div className="hterm-line">$ <em>harakiri</em> create --template python-3.12-data</div>
        <div className="hterm-line muted">Use the returned sandbox ID below.</div>
        <div className="hterm-line">$ <em>harakiri</em> run "$SBX_ID" \</div>
        <div className="hterm-line">&nbsp;&nbsp;--cmd "python -c 'print(2 + 2)'"</div>
        <div className="hterm-line"><span className="ok">4</span></div>
        <div className="hterm-line">$ <em>harakiri</em> kill "$SBX_ID"</div>
        <div className="hterm-line muted">Retain files separately when the next task needs them.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
      </div>
    </div>
  </div>
);

const Feature = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
  <div className="feat"><span className="feat-ico"><Icon name={icon} size={16} /></span><div className="feat-t">{title}</div><div className="feat-b">{body}</div></div>
);

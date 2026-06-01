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
        <h1 className="hero-h1">Disposable VMs<br />for code your agents<br /><span className="ink-red">should not be trusted</span> with.</h1>
        <p className="hero-sub">Harakiri provisions sealed sandboxes, manages lifecycle, routes, schedules, and API keys, and gives teams a polished developer surface on top of OpenSandbox.</p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => go("onboarding")}>Start building -&gt;</button>
          <button className="btn btn-lg" onClick={() => go("docs")}>Read the docs <Icon name="arrowR" size={12} /></button>
        </div>
        <div className="hero-meta">
          <span><Icon name="check" size={12} /> Keycloak auth</span>
          <span><Icon name="check" size={12} /> Sandbox control plane</span>
          <span><Icon name="check" size={12} /> k0s deployable</span>
        </div>
      </div>
      <HeroTerminal />
    </section>
    <section className="section">
      <div className="feat-grid">
        <Feature icon="bolt" title="Fast lifecycle" body="Create, run, renew, route, and kill sandboxes through one control-plane API." />
        <Feature icon="lock" title="Tenant scoped" body="Every API key and Keycloak session is tied to an organization boundary." />
        <Feature icon="terminal" title="CLI first" body="The same API powers the dashboard and the harakiri command-line workflow." />
        <Feature icon="chart" title="Usage aware" body="Lifecycle events, metrics, and schedules are persisted for inspection." />
        <Feature icon="globe" title="Routing records" body="Exposed ports are tracked and visible in the network tab." />
        <Feature icon="box" title="OpenSandbox wrapper" body="Provider integration stays behind a small adapter for runtime portability." />
      </div>
    </section>
    <section className="cta"><div className="cta-inner"><h2 className="cta-h">Your agent ships a bug. The sandbox dies.</h2><button className="btn btn-primary btn-lg" onClick={() => go("onboarding")}>Start building <Icon name="arrowR" size={12} /></button></div></section>
  </div>
);

const HeroTerminal = () => (
  <div className="hero-canvas">
    <div className="hterm hterm-brand card">
      <div className="hterm-bar"><span className="terminal-key">E</span><span className="hterm-title">TERMINAL BANNER</span><span className="pill live" style={{ marginLeft: "auto" }}><span className="dot" /> running</span></div>
      <div className="hterm-body">
        <div className="terminal-brand-banner"><BrandMark size={68} /></div>
        <div className="hterm-line">$ <em>harakiri</em> init</div>
        <div className="hterm-line muted">-&gt; ok. sealed. ready.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
        <div className="terminal-sep" />
        <div className="hterm-line">$ <em>harakiri</em> create --template python-3.12-data</div>
        <div className="hterm-line muted">-&gt; provisioning microVM... <span className="num">137ms</span></div>
        <div className="hterm-line muted">-&gt; sealed. id=<b>sbx_jt29kf01x4</b></div>
        <div className="hterm-line">$ <em>harakiri</em> run --stdin agent.py</div>
        <div className="hterm-line muted">&gt;&gt;&gt; reading market_data.csv (412kb)</div>
        <div className="hterm-line muted">&gt;&gt;&gt; fitting model on 18,402 rows</div>
        <div className="hterm-line"><span className="ok">ok</span> rmse=<span className="num">0.0418</span> - runtime=<span className="num">3.41s</span></div>
        <div className="hterm-line muted">-&gt; sandbox terminated. disk zeroed.</div>
        <div className="hterm-line">$ <span className="blink">|</span></div>
      </div>
    </div>
  </div>
);

const Feature = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
  <div className="feat"><span className="feat-ico"><Icon name={icon} size={16} /></span><div className="feat-t">{title}</div><div className="feat-b">{body}</div></div>
);

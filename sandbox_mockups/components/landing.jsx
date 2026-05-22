// Marketing landing page
const { useState: useStateL } = React;

const Landing = ({ go }) => {
  return (
    <div className="landing">
      <LandingNav go={go} />
      <Hero go={go} />
      <Logos />
      <FeatureGrid />
      <CodeShowcase />
      <Metrics />
      <Templates />
      <SecurityRow />
      <CTA go={go} />
      <Footer />
    </div>
  );
};

const LandingNav = ({ go }) => (
  <div className="topnav">
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <a onClick={() => go('landing')} style={{cursor:'pointer'}}><Brand /></a>
      <div className="links" style={{ marginLeft: 8 }}>
        <a className="active">Product</a>
        <a>Customers</a>
        <a onClick={() => go('docs')} style={{cursor:'pointer'}}>Docs</a>
        <a>Changelog</a>
      </div>
    </div>
    <div className="right">
      <button className="btn btn-ghost btn-sm" onClick={() => go('dashboard')}>Sign in</button>
      <button className="btn btn-primary btn-sm" onClick={() => go('onboarding')}>
        Get started <Icon name="arrowR" size={12} />
      </button>
    </div>
  </div>
);

const Hero = ({ go }) => (
  <section className="hero">
    <div className="hero-inner">
      <div className="hero-eyebrow">
        <span className="brand-mark" style={{ width: 8, height: 8 }} />
        <span>v0.41 — GPU pool <b>L4</b> now generally available</span>
        <Icon name="arrowR" size={11} />
      </div>
      <h1 className="hero-h1">
        Disposable VMs<br/>
        for code your agents<br/>
        <span className="ink-red">should not be trusted</span> with.
      </h1>
      <p className="hero-sub">
        Harakiri spins up a sealed micro&#8209;VM in <span className="num">137ms</span>, runs whatever
        your model writes, and ends itself when the turn is over. Built for AI agents,
        eval harnesses, and code interpreters.
      </p>
      <div className="hero-cta">
        <button className="btn btn-primary btn-lg" onClick={() => go('onboarding')}>
          Start building &rarr;
        </button>
        <button className="btn btn-lg" onClick={() => go('docs')}>
          Read the docs <Icon name="arrowR" size={12} />
        </button>
      </div>
      <div className="hero-meta">
        <span><Icon name="check" size={12} /> SOC 2 Type II</span>
        <span><Icon name="check" size={12} /> Open SDK</span>
        <span><Icon name="check" size={12} /> Self-hostable</span>
      </div>
    </div>
    <div className="hero-canvas">
      <HeroTerminal />
    </div>
  </section>
);

const HeroTerminal = () => {
  const [step, setStep] = useStateL(0);
  React.useEffect(() => {
    if (step < 6) {
      const t = setTimeout(() => setStep(step + 1), [600, 700, 600, 900, 700, 1200][step]);
      return () => clearTimeout(t);
    }
  }, [step]);
  return (
    <div className="hterm card">
      <div className="hterm-bar">
        <span className="dot r"/><span className="dot y"/><span className="dot g"/>
        <span className="hterm-title">sbx_jt29kf01x4 — agent-eval-runner</span>
        <span className="pill live" style={{marginLeft:'auto'}}><span className="dot" /> running</span>
      </div>
      <div className="hterm-body">
        <Line>$ <em>harakiri</em> create --template python-3.12-data</Line>
        {step >= 1 && <Line muted>→ provisioning microVM… <span className="num">137ms</span></Line>}
        {step >= 2 && <Line muted>→ sealed. id=<b>sbx_jt29kf01x4</b></Line>}
        {step >= 3 && <Line>$ <em>harakiri</em> run --stdin agent.py</Line>}
        {step >= 4 && <Line muted>{'>>> '}reading market_data.csv (412kb)</Line>}
        {step >= 4 && <Line muted>{'>>> '}fitting model on 18,402 rows</Line>}
        {step >= 5 && <Line><span className="ok">✓</span> rmse=<span className="num">0.0418</span> · runtime=<span className="num">3.41s</span></Line>}
        {step >= 5 && <Line muted>→ sandbox terminated. disk zeroed.</Line>}
        {step >= 6 && <Line>$ <span className="cur blink">▌</span></Line>}
      </div>
    </div>
  );
};
const Line = ({ children, muted }) => (
  <div className={'hterm-line ' + (muted ? 'muted' : '')}>{children}</div>
);

const Logos = () => (
  <section className="logos">
    <div className="logos-label">Trusted by teams building the agents you'll use next</div>
    <div className="logos-row">
      {['NORTHRIVER', 'kestrel.ai', 'PARALLAX', 'Inkstone', 'manifold/', 'BOLT&CO', 'lyra'].map(n =>
        <span key={n} className="logo-mark">{n}</span>
      )}
    </div>
  </section>
);

const FeatureGrid = () => (
  <section className="section">
    <SectionHead eyebrow="Primitives" title="A runtime designed for code that wasn't written by a human." />
    <div className="feat-grid">
      <Feature icon="bolt"    title="137ms cold start" body="Firecracker-backed microVMs that boot before your LLM finishes its next sentence." />
      <Feature icon="lock"    title="Sealed by default" body="Each sandbox is a fresh kernel, ephemeral disk, and locked-down network. No leakage between turns." />
      <Feature icon="terminal" title="One API, every surface" body="PTY, filesystem, ports, HTTP — all over a single SDK call. No SSH gymnastics." />
      <Feature icon="cpu"     title="GPU-aware" body="Attach an L4, A10, or H100 for the duration of a single tool call. Pay by the second." />
      <Feature icon="git"     title="Snapshot &amp; fork" body="Pause a sandbox mid-execution. Resume it from another agent. Diff the filesystem between branches." />
      <Feature icon="globe"   title="Egress you control" body="Allowlist domains per template. Audit every outbound packet your agent makes." />
    </div>
  </section>
);
const Feature = ({ icon, title, body }) => (
  <div className="feat">
    <span className="feat-ico"><Icon name={icon} size={16} /></span>
    <div className="feat-t">{title}</div>
    <div className="feat-b">{body}</div>
  </div>
);

const CodeShowcase = () => {
  const [tab, setTab] = useStateL('py');
  const snippets = {
    py: `from harakiri import Sandbox

sbx = Sandbox.create(template="python-3.12-data")
result = sbx.run("""
    import pandas as pd
    df = pd.read_csv("/tmp/orders.csv")
    print(df.groupby("region").revenue.sum())
""")

print(result.stdout)
sbx.kill()   # 'harakiri'`,
    ts: `import { Sandbox } from "@harakiri/sdk";

const sbx = await Sandbox.create({ template: "node-20-chromium" });

await sbx.files.write("/agent/main.ts", agentCode);
const { stdout } = await sbx.run("bun /agent/main.ts");

console.log(stdout);
await sbx.kill();   // 'harakiri'`,
    sh: `$ curl https://api.harakiri.dev/v1/sandboxes \\
    -H "Authorization: Bearer $HK_KEY" \\
    -d '{"template":"python-3.12"}'

{ "id": "sbx_jt29kf01x4",
  "url": "https://sbx_jt29kf01x4.sandbox.harakiri.dev",
  "expires_in": 300 }`
  };
  return (
    <section className="section">
      <SectionHead eyebrow="SDK" title="Five lines. One sandbox. Gone in a flash." />
      <div className="code-card card">
        <div className="code-tabs">
          {[['py','Python'],['ts','TypeScript'],['sh','REST']].map(([k,l]) => (
            <button key={k} className={'code-tab ' + (tab===k?'active':'')} onClick={() => setTab(k)}>{l}</button>
          ))}
          <div style={{marginLeft:'auto', display:'flex', gap:8, alignItems:'center'}}>
            <span className="tag">main.{tab === 'sh' ? 'sh' : tab}</span>
            <button className="btn btn-ghost btn-sm"><Icon name="copy" size={12} /> Copy</button>
          </div>
        </div>
        <pre className="code-pre"><code>{snippets[tab]}</code></pre>
      </div>
    </section>
  );
};

const Metrics = () => (
  <section className="section">
    <div className="metrics-row">
      <Stat n="137ms" l="p50 cold start" sub="firecracker microVM, warm pool drained" />
      <Stat n="14M" l="sandboxes / week" sub="across agent runtimes &amp; eval harnesses" />
      <Stat n="99.97%" l="uptime, trailing 90d" sub="status.harakiri.dev" />
      <Stat n="3.2s" l="avg runtime" sub="per sandbox lifetime" />
    </div>
  </section>
);
const Stat = ({ n, l, sub }) => (
  <div className="stat">
    <div className="stat-n num">{n}</div>
    <div className="stat-l">{l}</div>
    <div className="stat-s" dangerouslySetInnerHTML={{__html: sub}} />
  </div>
);

const Templates = () => (
  <section className="section">
    <SectionHead eyebrow="Templates" title="Boot from a curated image, or bring your own Dockerfile." />
    <div className="tmpl-grid">
      {TEMPLATES.map(t => (
        <div key={t.id} className="tmpl card">
          <div className="tmpl-head">
            <span className="tmpl-ico"><Icon name={t.icon} size={14} /></span>
            <span className="tmpl-name">{t.name}</span>
          </div>
          <div className="tmpl-desc">{t.desc}</div>
          <div className="tmpl-tags">
            {t.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
          </div>
        </div>
      ))}
    </div>
  </section>
);

const SecurityRow = () => (
  <section className="section sec-row">
    <div className="sec-left">
      <SectionHead eyebrow="Isolation" title="Three layers between your agent and a bad day." inline />
      <ul className="sec-list">
        <li><b>Kernel.</b> Firecracker VMM. No shared kernel between tenants. KVM-enforced syscall boundary.</li>
        <li><b>Network.</b> Allowlisted egress per template. WireGuard for inbound. No metadata service exposure.</li>
        <li><b>Lifecycle.</b> Disks are zeroed on TTL. Snapshots encrypted at rest with per-org keys.</li>
      </ul>
    </div>
    <div className="sec-right">
      <div className="diagram card">
        <DiagramLayer label="Your agent / orchestrator" sub="LangGraph, custom, etc." tone="muted" />
        <DiagramArrow />
        <DiagramLayer label="harakiri control plane" sub="auth · scheduling · routing" tone="muted" />
        <DiagramArrow />
        <DiagramLayer label="microVM (firecracker)" sub="ephemeral kernel + rootfs" tone="accent" />
        <DiagramArrow dashed />
        <DiagramLayer label="egress allowlist" sub="github.com, pypi.org, …" tone="muted" />
      </div>
    </div>
  </section>
);
const DiagramLayer = ({ label, sub, tone }) => (
  <div className={'dlayer ' + (tone || '')}>
    <div className="dlayer-l">{label}</div>
    <div className="dlayer-s">{sub}</div>
  </div>
);
const DiagramArrow = ({ dashed }) => (
  <div className={'darrow ' + (dashed ? 'dash' : '')}><span/></div>
);

const CTA = ({ go }) => (
  <section className="cta">
    <div className="cta-inner">
      <div>
        <h2 className="cta-h">Your agent ships a bug. The sandbox dies. You sleep.</h2>
        <p className="cta-s">A few lines of SDK. Sealed VMs. Zero infra to manage.</p>
      </div>
      <div style={{display:'flex', gap:10}}>
        <button className="btn btn-lg" onClick={() => go('docs')}>Read the docs</button>
        <button className="btn btn-primary btn-lg" onClick={() => go('onboarding')}>
          Start building <Icon name="arrowR" size={12} />
        </button>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="footer">
    <div className="footer-row">
      <Brand />
      <div className="footer-cols">
        <FooterCol head="Product" items={['Sandboxes','Templates','GPUs','Snapshots','Changelog']} />
        <FooterCol head="Developers" items={['Docs','SDKs','Changelog','Status','System design']} />
        <FooterCol head="Company" items={['About','Careers','Security','Press','Contact']} />
      </div>
    </div>
    <div className="footer-bot">
      <span>© 2026 Harakiri Labs, Inc.</span>
      <span className="num" style={{color:'var(--muted)'}}>commit 9f3a1cd · v0.41.2 · status · ok</span>
    </div>
  </footer>
);
const FooterCol = ({ head, items }) => (
  <div className="footer-col">
    <div className="footer-h">{head}</div>
    {items.map(i => <a key={i}>{i}</a>)}
  </div>
);

const SectionHead = ({ eyebrow, title, inline }) => (
  <div className={'sec-head ' + (inline ? 'inline' : '')}>
    <div className="eyebrow">
      <span className="eyebrow-bar" />
      <span>{eyebrow}</span>
    </div>
    <h2 className="sec-title">{title}</h2>
  </div>
);

window.Landing = Landing;
window.LandingNav = LandingNav;
window.SectionHead = SectionHead;

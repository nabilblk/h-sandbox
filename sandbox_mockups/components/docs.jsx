// Docs / API reference
const { useState: useStateK } = React;

const Docs = ({ go }) => {
  const [section, setSection] = useStateK('quickstart');
  return (
    <div className="app">
      <LandingNav go={go} />
      <div className="docs">
        <aside className="docs-side">
          <DocsNav active={section} go={setSection} />
        </aside>
        <main className="docs-body">
          {section === 'quickstart' && <DocsQuickstart />}
          {section === 'create' && <DocsCreate />}
          {section === 'run' && <DocsRun />}
          {section === 'filesystem' && <DocsFilesystem />}
          {section === 'templates' && <DocsTemplates />}
          {section === 'security' && <DocsSecurity />}
        </main>
        <aside className="docs-toc">
          <DocsToc />
        </aside>
      </div>
    </div>
  );
};

const DocsNav = ({ active, go }) => {
  const items = [
    ['Getting started', [
      ['quickstart', 'Quickstart'],
      ['create', 'Create a sandbox'],
      ['run', 'Run code'],
    ]],
    ['Concepts', [
      ['filesystem', 'Filesystem'],
      ['templates', 'Templates'],
      ['security', 'Security model'],
    ]],
    ['API reference', [
      ['ep-create', 'POST /sandboxes'],
      ['ep-get',    'GET  /sandboxes/{id}'],
      ['ep-run',    'POST /sandboxes/{id}/run'],
      ['ep-files',  'GET  /sandboxes/{id}/files'],
      ['ep-kill',   'DELETE /sandboxes/{id}'],
    ]],
    ['SDKs', [
      ['sdk-py', 'Python'],
      ['sdk-ts', 'TypeScript'],
      ['sdk-rs', 'Rust'],
      ['sdk-go', 'Go'],
    ]],
  ];
  return (
    <>
      <div style={{padding:'4px 8px 14px', display:'flex', alignItems:'center', gap:8}}>
        <div className="search-input" style={{width:'100%', height:30}}>
          <Icon name="search" size={11}/>
          <input placeholder="Search docs…"/>
          <span className="kbd">⌘K</span>
        </div>
      </div>
      {items.map(([head, links]) => (
        <div key={head}>
          <div className="docs-section-h">{head}</div>
          {links.map(([k, l]) => (
            <a key={k} className={'docs-link ' + (active === k ? 'active' : '')} onClick={() => go(k)}>{l}</a>
          ))}
        </div>
      ))}
    </>
  );
};

const DocsToc = () => (
  <>
    <div className="docs-toc-h">On this page</div>
    <a className="active">Install the SDK</a>
    <a>Create your first sandbox</a>
    <a>Run code</a>
    <a>Read files back</a>
    <a>Kill it</a>
    <div style={{marginTop:18, padding:'14px 12px', border:'1px solid var(--border)', borderRadius:'var(--r-md)', background:'var(--surface)'}}>
      <div style={{fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, marginBottom:6}}>Need help?</div>
      <div style={{fontSize:12.5, color:'var(--ink-2)'}}>Ping us on <a style={{color:'var(--accent)'}}>Discord</a> or open an issue on <a style={{color:'var(--accent)'}}>GitHub</a>.</div>
    </div>
  </>
);

const DocsQuickstart = () => (
  <article>
    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14, fontSize:12, color:'var(--muted)'}}>
      <span>Getting started</span>
      <Icon name="chevron" size={10}/>
      <span style={{color:'var(--ink)'}}>Quickstart</span>
    </div>
    <h1>Quickstart</h1>
    <p className="lede">Spawn a sealed Python sandbox, run code in it, and end it — all from your laptop, in under three minutes.</p>

    <h2>Install the SDK</h2>
    <p>Harakiri ships first-class SDKs for Python and TypeScript. The Python one is the fastest to try:</p>
    <pre>{`$ pip install harakiri
$ export HK_KEY="hk_live_..."`}</pre>

    <h2>Create your first sandbox</h2>
    <p>A sandbox is an ephemeral Firecracker microVM with an isolated kernel and rootfs. Booting one takes about 140ms:</p>
    <pre>{`from harakiri import Sandbox

sbx = Sandbox.create(template="python-3.12")
print(sbx.id)             # sbx_jt29kf01x4
print(sbx.url)            # sbx_jt29kf01x4.sandbox.harakiri.dev`}</pre>

    <h2>Run code</h2>
    <p>You can run code via <code>sbx.run()</code>. It takes either a shell command or a Python expression. The result includes <code>stdout</code>, <code>stderr</code>, and <code>exit_code</code>.</p>
    <pre>{`result = sbx.run("python -c 'print(2+2)'")
assert result.stdout.strip() == "4"
assert result.exit_code == 0`}</pre>

    <h2>Read files back</h2>
    <p>Sandboxes have a flat filesystem rooted at <code>/root</code>. You can write and read files through the SDK:</p>
    <pre>{`sbx.files.write("/root/data.csv", csv_bytes)
sbx.run("python clean.py /root/data.csv")
cleaned = sbx.files.read("/root/data.cleaned.csv")`}</pre>

    <h2>Kill it</h2>
    <p>When you're done, call <code>sbx.kill()</code>. The disk is zeroed and the VM is destroyed. Idle sandboxes are also auto-killed after their <code>ttl_s</code> elapses (default 300s).</p>
    <pre>{`sbx.kill()
# or, in a context manager:
with Sandbox.create(template="python-3.12") as sbx:
    sbx.run("...")
    # auto-killed on exit`}</pre>

    <div style={{marginTop:36, padding:'18px 22px', border:'1px solid var(--border)', borderRadius:'var(--r-md)', background:'var(--surface-2)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div>
        <div style={{fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600}}>Next</div>
        <div style={{fontWeight:600, marginTop:2}}>Templates: build your own image</div>
      </div>
      <button className="btn btn-sm">Read more <Icon name="arrowR" size={11}/></button>
    </div>
  </article>
);

const DocsCreate = () => (
  <article>
    <h1>Create a sandbox</h1>
    <p className="lede">Sandboxes are the unit of execution in Harakiri. Each one is a fresh microVM.</p>

    <span className="api-endpoint">
      <span className="api-method post">POST</span>
      <code>/v1/sandboxes</code>
    </span>

    <h3>Request body</h3>
    <div className="api-table">
      <div className="api-table-row"><div>Parameter</div><div>Type</div><div>Description</div></div>
      <div className="api-table-row"><code>template</code><div><code>string</code></div><div>Template ID. e.g. <code>python-3.12</code>. Required.</div></div>
      <div className="api-table-row"><code>ttl_s</code><div><code>integer</code></div><div>Idle TTL in seconds. Default 300. Max 3600.</div></div>
      <div className="api-table-row"><code>env</code><div><code>object</code></div><div>Environment variables. Max 8KB.</div></div>
      <div className="api-table-row"><code>resources</code><div><code>object</code></div><div><code>{`{ cpu: 2, memory_mb: 2048, gpu: "l4" }`}</code></div></div>
    </div>

    <h3>Example</h3>
    <pre>{`curl https://api.harakiri.dev/v1/sandboxes \\
  -H "Authorization: Bearer $HK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template": "python-3.12-data",
    "ttl_s": 600
  }'

{
  "id": "sbx_jt29kf01x4",
  "url": "https://sbx_jt29kf01x4.sandbox.harakiri.dev",
  "status": "running",
  "expires_at": "2026-05-22T18:14:00Z"
}`}</pre>
  </article>
);

const DocsRun = () => (
  <article>
    <h1>Run code</h1>
    <p className="lede">Execute commands inside a sandbox. Captures stdout, stderr, and exit code.</p>
    <span className="api-endpoint">
      <span className="api-method post">POST</span>
      <code>/v1/sandboxes/{`{id}`}/run</code>
    </span>
    <pre>{`sbx.run("python agent.py", stdin=input_text, timeout=30)
# → RunResult(stdout, stderr, exit_code, duration_ms)`}</pre>
    <p>For streaming output, use <code>sbx.run_stream()</code> which returns an async iterator of chunks.</p>
    <pre>{`async for chunk in sbx.run_stream("python long_task.py"):
    print(chunk.text, end="", flush=True)`}</pre>
  </article>
);

const DocsFilesystem = () => (
  <article>
    <h1>Filesystem</h1>
    <p className="lede">Each sandbox gets an ephemeral 10GB rootfs. Writes are persisted only for the lifetime of the VM.</p>
    <h2>Read &amp; write</h2>
    <pre>{`sbx.files.write("/root/data.json", json_bytes)
sbx.files.read("/root/output.csv")  # → bytes
sbx.files.list("/root")             # → ["agent.py", "data.json", ...]`}</pre>
    <h2>Mounts</h2>
    <p>You can mount a read-only directory from object storage at boot via the <code>mounts</code> param.</p>
    <pre>{`Sandbox.create(
    template="python-3.12-data",
    mounts=[{"source": "s3://my-bucket/data", "target": "/data", "ro": True}],
)`}</pre>
  </article>
);

const DocsTemplates = () => (
  <article>
    <h1>Templates</h1>
    <p className="lede">A template is a pre-baked rootfs. Harakiri ships a curated set, but you can build your own from a Dockerfile.</p>
    <h2>Built-in templates</h2>
    <div className="api-table">
      <div className="api-table-row"><div>ID</div><div>Boot</div><div>Description</div></div>
      {TEMPLATES.map(t => (
        <div key={t.id} className="api-table-row">
          <code>{t.id}</code><code className="num">~{Math.floor(Math.random()*180+80)}ms</code><div>{t.desc}</div>
        </div>
      ))}
    </div>
    <h2>Custom templates</h2>
    <p>Push a Dockerfile, get a template back:</p>
    <pre>{`$ harakiri template build ./Dockerfile --name my-stack
→ building… ████████████░░░░  68%
→ template my-stack@a8f1c3 ready (boot ≈ 184ms)`}</pre>
  </article>
);

const DocsSecurity = () => (
  <article>
    <h1>Security model</h1>
    <p className="lede">Three layers between your agent and a bad day.</p>
    <h2>Kernel isolation</h2>
    <p>Every sandbox runs in its own Firecracker microVM. There is no shared kernel between tenants. Syscalls cross a KVM boundary. Container escapes are not in the threat model — there is no container.</p>
    <h2>Network</h2>
    <p>By default, all egress is denied. You allowlist domains per template. Inbound traffic comes in through a WireGuard tunnel — no public ports unless explicitly exposed via <code>sbx.expose(port)</code>.</p>
    <h2>Data lifecycle</h2>
    <p>Disks are zeroed when a sandbox terminates. Snapshots are encrypted at rest with per-org keys. You can plug in your own KMS.</p>
  </article>
);

const DocsLimits = null;

window.Docs = Docs;

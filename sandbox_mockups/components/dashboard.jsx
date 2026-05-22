// Dashboard — sandboxes list, metrics
const { useState: useStateD, useMemo: useMemoD } = React;

const Dashboard = ({ go, route, openSandbox }) => {
  const sub = route.split('/')[1] || 'sandboxes';
  return (
    <div className="dash">
      <DashSidebar go={go} active={sub} />
      <div className="dash-main">
        <DashTopbar go={go} sub={sub} />
        {sub === 'sandboxes' && <SandboxList go={go} openSandbox={openSandbox} />}
        {sub === 'templates'  && <DashTemplates />}
        {sub === 'metrics'    && <DashMetrics />}
        {sub === 'keys'       && <DashKeys />}
        {sub === 'settings'   && <DashSettings />}
      </div>
    </div>
  );
};

const DashSidebar = ({ go, active }) => {
  const items = [
    { k: 'sandboxes', l: 'Sandboxes', i: 'box' },
    { k: 'templates', l: 'Templates', i: 'folder' },
    { k: 'metrics',   l: 'Usage',     i: 'chart' },
    { k: 'keys',      l: 'API keys',  i: 'key' },
    { k: 'settings',  l: 'Settings',  i: 'settings' },
  ];
  return (
    <aside className="dash-side">
      <div className="dash-side-brand">
        <a onClick={() => go('landing')} style={{cursor:'pointer'}}><Brand /></a>
      </div>
      <div className="org-switcher">
        <div className="org-ava">L</div>
        <div style={{flex:1, minWidth:0}}>
          <div className="org-name">lyra-labs</div>
          <div className="org-plan">Team · 4 seats</div>
        </div>
        <Icon name="chevDown" size={12} />
      </div>
      <nav className="side-nav">
        {items.map(it => (
          <a key={it.k}
             className={'side-link ' + (active === it.k ? 'active' : '')}
             onClick={() => go('dashboard/' + it.k)}>
            <Icon name={it.i} size={14} />
            <span>{it.l}</span>
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="usage-mini">
          <div className="usage-mini-h">
            <span>Status</span>
            <span className="num" style={{color:'var(--ok)'}}>● operational</span>
          </div>
          <div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:6}}>v0.41.2 · all systems</div>
        </div>
      </div>
    </aside>
  );
};

const DashTopbar = ({ go, sub }) => (
  <div className="dash-top">
    <div className="dash-crumbs">
      <span style={{color:'var(--muted)'}}>lyra-labs</span>
      <Icon name="chevron" size={11} style={{color:'var(--muted-2)'}} />
      <span style={{textTransform:'capitalize'}}>{sub}</span>
    </div>
    <div className="dash-top-r">
      <button className="btn btn-ghost btn-sm" title="Search"><Icon name="search" size={13}/><span className="kbd" style={{marginLeft:6}}>⌘K</span></button>
      <button className="btn btn-ghost btn-sm" title="Docs" onClick={() => go('docs')}><Icon name="book" size={13}/></button>
      <button className="btn btn-ghost btn-sm" title="Notifications"><Icon name="bell" size={13}/></button>
      <div className="ava-sm">L</div>
    </div>
  </div>
);

/* ─── Sandboxes ─── */

const SandboxList = ({ go, openSandbox }) => {
  const [filter, setFilter] = useStateD('all');
  const [q, setQ] = useStateD('');
  const [showCreate, setShowCreate] = useStateD(false);
  const rows = useMemoD(() => {
    return MOCK_SANDBOXES.filter(s => filter === 'all' || s.status === filter)
      .filter(s => !q || s.name.includes(q) || s.id.includes(q));
  }, [filter, q]);
  const running = MOCK_SANDBOXES.filter(s => s.status === 'running').length;
  return (
    <div className="dash-page">
      <div className="page-head">
        <div>
          <h1 className="page-h">Sandboxes</h1>
          <div className="page-sub">
            <span><span className="dot live" /> <b className="num">{running}</b> running</span>
            <span><span className="dot idle" /> <b className="num">{MOCK_SANDBOXES.filter(s=>s.status==='idle').length}</b> idle</span>
            <span><span className="dot err"  /> <b className="num">{MOCK_SANDBOXES.filter(s=>s.status==='error').length}</b> errored</span>
            <span style={{color:'var(--muted)'}}>· last <span className="num">7d</span></span>
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-sm"><Icon name="refresh" size={12} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={12} /> New sandbox
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-tabs">
          {[['all','All'],['running','Running'],['idle','Idle'],['error','Errored']].map(([k,l]) =>
            <button key={k} className={'filter-tab ' + (filter===k?'active':'')} onClick={() => setFilter(k)}>{l}</button>
          )}
        </div>
        <div className="filter-right">
          <div className="search-input">
            <Icon name="search" size={12} />
            <input placeholder="Filter by name or id…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm">Owner <Icon name="chevDown" size={11} /></button>
          <button className="btn btn-ghost btn-sm">Template <Icon name="chevDown" size={11} /></button>
        </div>
      </div>

      <div className="sbx-table card">
        <div className="sbx-tr sbx-head">
          <div>Name</div>
          <div>Status</div>
          <div>Template</div>
          <div>CPU</div>
          <div>Mem</div>
          <div>Started</div>
          <div></div>
        </div>
        {rows.map(s => (
          <div key={s.id} className="sbx-tr" onClick={() => openSandbox(s.id)}>
            <div>
              <div className="sbx-name">{s.name}</div>
              <div className="sbx-id num">{s.id}</div>
            </div>
            <div><span className={'pill ' + s.status}><span className="dot" /> {s.status}</span></div>
            <div><span className="tag">{s.template}</span></div>
            <div className="num"><MeterBar v={s.cpu} max={100} /> {s.cpu}%</div>
            <div className="num">{s.mem} MB</div>
            <div className="num" style={{color:'var(--muted)'}}>{s.started}</div>
            <div className="ta-r">
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openSandbox(s.id); }}>
                Open <Icon name="arrowR" size={11} />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="sbx-empty">No sandboxes match your filter.</div>
        )}
      </div>

      <div className="dash-foot-tip">
        Tip: kill all idle sandboxes with <code>harakiri kill --idle</code>. Or set TTL per template.
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={(id) => { setShowCreate(false); openSandbox(id); }} />}
    </div>
  );
};

const MeterBar = ({ v, max }) => (
  <span className="meter">
    <span className="meter-fill" style={{
      width: Math.min(100, (v/max)*100) + '%',
      background: v > 80 ? 'var(--err)' : v > 50 ? 'var(--warn)' : 'var(--ok)'
    }} />
  </span>
);

const CreateModal = ({ onClose, onCreate }) => {
  const [tmpl, setTmpl] = useStateD('python-3.12-data');
  const [name, setName] = useStateD('');
  const [ttl, setTtl] = useStateD(300);
  const [loading, setLoading] = useStateD(false);
  const submit = () => {
    setLoading(true);
    setTimeout(() => onCreate(mkId()), 900);
  };
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>New sandbox</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12}/></button>
        </div>
        <div className="modal-body">
          <Field label="Template">
            <div className="tmpl-pick">
              {TEMPLATES.slice(0, 4).map(t => (
                <button key={t.id} className={'tmpl-pick-c ' + (tmpl === t.id ? 'active' : '')} onClick={() => setTmpl(t.id)}>
                  <Icon name={t.icon} size={14} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Name (optional)" hint="A label for your own reference">
            <input className="input" placeholder="agent-eval-runner" value={name} onChange={e=>setName(e.target.value)} />
          </Field>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <Field label="Idle TTL" hint="Auto-kill after N seconds idle">
              <input className="input mono" type="number" value={ttl} onChange={e=>setTtl(+e.target.value)} />
            </Field>
            <Field label="Resources" hint="vCPU · memory">
              <select className="input">
                <option>2 vCPU · 2 GiB</option>
                <option>4 vCPU · 4 GiB</option>
                <option>8 vCPU · 8 GiB</option>
              </select>
            </Field>
          </div>
          <div className="cost-est">
            <span style={{color:'var(--muted)'}}>Cold start</span>
            <span className="num">~142ms · idle TTL {ttl}s</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner"/> Provisioning…</> : <>Create sandbox <Icon name="arrowR" size={11} /></>}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <div className="field">
    <div className="field-l">{label}</div>
    {children}
    {hint && <div className="field-h">{hint}</div>}
  </div>
);

/* ─── Templates ─── */

const DashTemplates = () => (
  <div className="dash-page">
    <div className="page-head">
      <div>
        <h1 className="page-h">Templates</h1>
        <div className="page-sub"><span style={{color:'var(--muted)'}}>Pre-built images for fast cold starts.</span></div>
      </div>
      <button className="btn btn-primary btn-sm"><Icon name="plus" size={12}/> New template</button>
    </div>
    <div className="tmpl-grid" style={{maxWidth:'unset'}}>
      {TEMPLATES.map(t => (
        <div key={t.id} className="tmpl card" style={{padding:22}}>
          <div className="tmpl-head"><span className="tmpl-ico"><Icon name={t.icon}/></span><span className="tmpl-name">{t.name}</span></div>
          <div className="tmpl-desc">{t.desc}</div>
          <div style={{display:'flex', gap:8, marginTop:10, alignItems:'center'}}>
            <span className="tag num">{Math.floor(Math.random()*180+80)}ms boot</span>
            <span className="tag">{['public','public','public','public','public','private'][TEMPLATES.indexOf(t)]}</span>
          </div>
          <div style={{display:'flex', gap:6, marginTop:12}}>
            <button className="btn btn-sm" style={{flex:1}}>Use template</button>
            <button className="btn btn-ghost btn-sm"><Icon name="copy" size={11} /></button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ─── Metrics ─── */

const DashMetrics = () => {
  // synthetic series
  const days = 14;
  const data = useMemoD(() => Array.from({length: days*24}, (_, i) => {
    const h = i % 24;
    const wave = Math.sin((i/12)) * 0.4 + 1;
    const base = (h > 8 && h < 22 ? 1 : 0.4);
    return Math.max(0, (base + Math.random()*0.4) * wave * 38);
  }), []);
  return (
    <div className="dash-page">
      <div className="page-head">
        <div>
          <h1 className="page-h">Usage</h1>
          <div className="page-sub"><span style={{color:'var(--muted)'}}>Across all sandboxes · last 14 days</span></div>
        </div>
        <div style={{display:'flex', gap:6}}>
          <button className="btn btn-sm active">14d</button>
          <button className="btn btn-ghost btn-sm">30d</button>
          <button className="btn btn-ghost btn-sm">90d</button>
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:14}}>
        <KPI label="Sandboxes spawned" v="14,201" delta="+18.4%" />
        <KPI label="Total compute-hours" v="312.4" delta="+9.1%" />
        <KPI label="Avg cold start" v="142ms" delta="-3ms" good />
        <KPI label="Avg runtime" v="4.18s" delta="-0.21s" good />
      </div>
      <div className="card" style={{padding:24}}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:18, alignItems:'baseline'}}>
          <div>
            <div style={{fontSize:13, color:'var(--muted)'}}>Concurrent sandboxes</div>
            <div className="num" style={{fontSize:24, marginTop:2}}>peak <b>184</b> · now <b>57</b></div>
          </div>
          <div style={{display:'flex', gap:14, fontSize:12, color:'var(--muted)'}}>
            <span><span className="lg-dot" style={{background:'var(--ink)'}}/> Running</span>
            <span><span className="lg-dot" style={{background:'var(--accent)'}}/> Errored</span>
          </div>
        </div>
        <Chart data={data} />
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:14}}>
        <div className="card" style={{padding:22}}>
          <div className="card-h">Top templates</div>
          <BarList items={[
            ['python-3.12-data', 47, '#0f0f0e'],
            ['node-20-chromium', 28, '#0f0f0e'],
            ['python-3.12',      18, '#0f0f0e'],
            ['ubuntu-24.04',      5, '#0f0f0e'],
            ['custom',            2, '#0f0f0e'],
          ]} />
        </div>
        <div className="card" style={{padding:22}}>
          <div className="card-h">Status breakdown</div>
          <BarList items={[
            ['running',     67, '#0f0f0e'],
            ['idle',        24, '#0f0f0e'],
            ['terminated',   7, '#0f0f0e'],
            ['errored',      2, '#0f0f0e'],
          ]} />
        </div>
      </div>
    </div>
  );
};

const KPI = ({ label, v, delta, good }) => (
  <div className="card" style={{padding:18}}>
    <div style={{fontSize:12, color:'var(--muted)'}}>{label}</div>
    <div className="num" style={{fontSize:22, marginTop:6, letterSpacing:'-0.01em'}}>{v}</div>
    <div style={{marginTop:4, fontSize:11.5, color: good ? 'var(--ok)' : 'var(--muted)'}}>{delta}</div>
  </div>
);

const Chart = ({ data }) => {
  const w = 880, h = 200, pad = 8;
  const max = Math.max(...data);
  const pts = data.map((v, i) => [pad + (i/(data.length-1))*(w-pad*2), h - pad - (v/max)*(h-pad*2)]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
  const area = path + ` L ${w-pad} ${h-pad} L ${pad} ${h-pad} Z`;
  return (
    <div style={{position:'relative', width:'100%'}}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', height:200, display:'block'}}>
        {[0.25,0.5,0.75].map((t,i) => (
          <line key={i} x1={pad} x2={w-pad} y1={h*t} y2={h*t} stroke="var(--border)" strokeDasharray="2 4"/>
        ))}
        <path d={area} fill="oklch(0.15 0.01 90 / 0.05)" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
      <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10.5, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
        <span>May 8</span><span>May 11</span><span>May 14</span><span>May 17</span><span>May 20</span><span>today</span>
      </div>
    </div>
  );
};

const BarList = ({ items }) => {
  const max = Math.max(...items.map(i => i[1]));
  return (
    <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}>
      {items.map(([l, v]) => (
        <div key={l} style={{display:'grid', gridTemplateColumns:'180px 1fr 40px', alignItems:'center', gap:10}}>
          <div style={{fontSize:13}}>{l}</div>
          <div className="bar"><div className="bar-fill" style={{width: (v/max)*100 + '%'}}/></div>
          <div className="num" style={{fontSize:12, color:'var(--muted)', textAlign:'right'}}>{v}%</div>
        </div>
      ))}
    </div>
  );
};

/* ─── API keys ─── */

const DashKeys = () => {
  const [revealed, setRevealed] = useStateD(null);
  const keys = [
    { id: 'k_live_a1b2', name: 'production', created: 'Apr 12', last: '2m ago', key: 'hk_live_28fcf...c81ed' },
    { id: 'k_live_x9p2', name: 'eval-harness', created: 'Mar 30', last: '5h ago', key: 'hk_live_44a09...771b3' },
    { id: 'k_test_z4q1', name: 'local-dev', created: 'May 02', last: 'idle', key: 'hk_test_991ab...4c7d0' },
  ];
  return (
    <div className="dash-page">
      <div className="page-head">
        <div>
          <h1 className="page-h">API keys</h1>
          <div className="page-sub"><span style={{color:'var(--muted)'}}>Keys grant full access to your org's sandboxes. Rotate them.</span></div>
        </div>
        <button className="btn btn-primary btn-sm"><Icon name="plus" size={12}/> Create key</button>
      </div>
      <div className="card">
        {keys.map((k, i) => (
          <div key={k.id} className="keys-row" style={{borderTop: i ? '1px solid var(--border)' : 'none'}}>
            <div>
              <div style={{fontWeight:600}}>{k.name}</div>
              <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>created {k.created} · last used {k.last}</div>
            </div>
            <div className="num" style={{fontSize:13}}>
              {revealed === k.id ? k.key : k.key.replace(/(.{8}).+(.{5})/, '$1' + '•'.repeat(18) + '$2')}
            </div>
            <div style={{display:'flex', gap:6}}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRevealed(revealed === k.id ? null : k.id)}>
                {revealed === k.id ? 'Hide' : 'Reveal'}
              </button>
              <button className="btn btn-ghost btn-sm"><Icon name="copy" size={11}/></button>
              <button className="btn btn-ghost btn-sm" style={{color:'var(--err)'}}>Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Settings ─── */

const DashSettings = () => (
  <div className="dash-page">
    <div className="page-head">
      <div>
        <h1 className="page-h">Settings</h1>
        <div className="page-sub"><span style={{color:'var(--muted)'}}>Org-wide controls.</span></div>
      </div>
    </div>
    <div className="card" style={{padding:22, marginBottom:14}}>
      <div className="card-h">Organization</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:12}}>
        <Field label="Name"><input className="input" defaultValue="lyra-labs"/></Field>
        <Field label="Slug"><input className="input mono" defaultValue="lyra-labs"/></Field>
      </div>
    </div>
    <div className="card" style={{padding:22, marginBottom:14}}>
      <div className="card-h">Defaults</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:12}}>
        <Field label="Idle TTL"><input className="input mono" defaultValue="300"/></Field>
        <Field label="Max concurrency"><input className="input mono" defaultValue="200"/></Field>
      </div>
    </div>
    <div className="card" style={{padding:22, borderColor:'oklch(0.55 0.2 25 / 0.2)'}}>
      <div className="card-h" style={{color:'var(--err)'}}>Danger zone</div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
        <div>
          <div style={{fontWeight:600}}>Kill all sandboxes</div>
          <div style={{fontSize:12, color:'var(--muted)'}}>Terminates every running sandbox in this org. Cannot be undone.</div>
        </div>
        <button className="btn" style={{color:'var(--err)', borderColor:'oklch(0.55 0.2 25 / 0.35)'}}>Harakiri all</button>
      </div>
    </div>
  </div>
);

window.Dashboard = Dashboard;

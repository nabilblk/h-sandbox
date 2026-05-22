// Sandbox detail — terminal, files, logs, metrics
const { useState: useStateS, useEffect: useEffectS, useRef: useRefS, useMemo: useMemoS } = React;

const SandboxDetail = ({ go, sbxId, openSandbox }) => {
  const sbx = MOCK_SANDBOXES.find(s => s.id === sbxId) || MOCK_SANDBOXES[0];
  const [tab, setTab] = useStateS('terminal');
  return (
    <div className="detail">
      <DetailSide go={go} current={sbx.id} openSandbox={openSandbox} />
      <div className="detail-main">
        <DetailTop sbx={sbx} go={go} />
        <div className="detail-tabs">
          {[
            ['terminal','Terminal','terminal'],
            ['files','Filesystem','file'],
            ['logs','Logs','logs'],
            ['metrics','Metrics','chart'],
            ['network','Network','globe'],
          ].map(([k,l,i]) => (
            <button key={k} className={'detail-tab ' + (tab===k?'active':'')} onClick={() => setTab(k)}>
              <Icon name={i} size={12}/> {l}
            </button>
          ))}
        </div>
        <div className="detail-body">
          {tab === 'terminal' && <TerminalPane sbx={sbx} />}
          {tab === 'files'    && <FilesPane sbx={sbx} />}
          {tab === 'logs'     && <LogsPane sbx={sbx} />}
          {tab === 'metrics'  && <MetricsPane sbx={sbx} />}
          {tab === 'network'  && <NetworkPane sbx={sbx} />}
        </div>
      </div>
    </div>
  );
};

const DetailSide = ({ go, current, openSandbox }) => (
  <aside className="dash-side" style={{padding:'16px 0'}}>
    <div className="dash-side-brand" style={{padding:'6px 20px 16px'}}>
      <a onClick={() => go('landing')} style={{cursor:'pointer'}}><Brand /></a>
    </div>
    <div style={{padding:'0 12px 12px'}}>
      <button className="btn btn-sm" style={{width:'100%'}} onClick={() => go('dashboard')}>
        <Icon name="chevron" size={11} style={{transform:'rotate(180deg)'}}/> All sandboxes
      </button>
    </div>
    <div style={{padding:'6px 16px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <span style={{fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600}}>Switch sandbox</span>
      <span className="num" style={{fontSize:11, color:'var(--muted)'}}>{MOCK_SANDBOXES.length}</span>
    </div>
    <div className="detail-sbx-list">
      {MOCK_SANDBOXES.map(s => (
        <div key={s.id}
             className={'detail-sbx-item ' + (s.id === current ? 'active' : '')}
             onClick={() => openSandbox(s.id)}>
          <div className="top">
            <span className={'pill ' + s.status} style={{padding:0, border:0, background:'transparent', height:'auto'}}>
              <span className="dot"/>
            </span>
            <span className="name">{s.name}</span>
            {s.id === current && (
              <span style={{marginLeft:'auto', fontSize:9.5, color:'var(--accent)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em'}}>viewing</span>
            )}
          </div>
          <div className="id">{s.id} · <span style={{color: s.status==='running' ? 'var(--ok)' : s.status==='idle' ? 'var(--warn)' : s.status==='error' ? 'var(--err)' : 'var(--muted)'}}>{s.status}</span></div>
        </div>
      ))}
    </div>
  </aside>
);

const DetailTop = ({ sbx, go }) => (
  <div className="detail-top">
    <div style={{display:'flex', alignItems:'baseline', gap:10, flex:1}}>
      <span className="detail-name">{sbx.name}</span>
      <span className="detail-id">{sbx.id}</span>
      <span className={'pill ' + sbx.status} style={{marginLeft:6}}>
        <span className="dot"/> {sbx.status}
      </span>
      <span className="tag" style={{marginLeft:4}}>{sbx.template}</span>
    </div>
    <div style={{display:'flex', gap:6}}>
      <button className="btn btn-ghost btn-sm"><Icon name="copy" size={11}/> Copy ID</button>
      <button className="btn btn-sm"><Icon name="play" size={11}/> Fork</button>
      <button className="btn btn-sm" style={{color:'var(--err)'}}><Icon name="stop" size={11}/> Kill</button>
    </div>
  </div>
);

/* TERMINAL */
const SEED_LINES = [
  { t: 'cmd', s: 'harakiri --version' },
  { t: 'out', s: 'harakiri v0.41.2 — runtime sealed' },
  { t: 'cmd', s: 'cat /etc/sandbox.json' },
  { t: 'out', s: '{ "id": "sbx_jt29kf01x4", "template": "python-3.12-data", "kernel": "linux-6.8.0-firecracker", "ttl_s": 300 }' },
  { t: 'cmd', s: 'python agent.py --task summarize.md' },
  { t: 'mut', s: '[12:04:18.412]  loading model: gpt-4.1-mini' },
  { t: 'mut', s: '[12:04:18.918]  tool: read_file("summarize.md") → 4214 bytes' },
  { t: 'mut', s: '[12:04:19.401]  tool: search_web("market sizing 2026") → 18 results' },
  { t: 'mut', s: '[12:04:21.114]  emitting tokens [████░░░░] 42%' },
  { t: 'ok',  s: '✓ task complete in 3.41s · 2148 tokens · ttl reset' },
];
const TerminalPane = ({ sbx }) => {
  const [lines, setLines] = useStateS([]);
  const [input, setInput] = useStateS('');
  const [running, setRunning] = useStateS(true);
  const [step, setStep] = useStateS(0);
  const inputRef = useRefS();
  const bodyRef = useRefS();

  useEffectS(() => {
    if (step < SEED_LINES.length) {
      const t = setTimeout(() => {
        setLines(l => [...l, SEED_LINES[step]]);
        setStep(s => s + 1);
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }, step === 0 ? 200 : [400, 250, 200, 400, 600, 500, 600, 700, 500, 400][step] || 400);
      return () => clearTimeout(t);
    } else {
      setRunning(false);
    }
  }, [step]);

  useEffectS(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines.length]);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim();
    setLines(l => [...l, { t: 'cmd', s: cmd }]);
    setInput('');
    // Fake responses
    setTimeout(() => {
      const responses = {
        ls: 'agent.py    requirements.txt    summarize.md    /tmp',
        pwd: '/root',
        whoami: 'root',
        date: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        clear: '__clear__',
      };
      const r = responses[cmd] ?? `harakiri: command echoed → ${cmd}`;
      if (r === '__clear__') setLines([]);
      else setLines(l => [...l, { t: 'out', s: r }]);
    }, 180);
  };

  return (
    <div className="term-pane">
      <div className="file-tree">
        <div className="ft-section">Workspace</div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/root</span></div>
        <div style={{paddingLeft:14}}>
          <div className="ft-row active"><Icon name="file" size={12}/><span className="ft-name">agent.py</span></div>
          <div className="ft-row"><Icon name="file" size={12}/><span className="ft-name">requirements.txt</span></div>
          <div className="ft-row"><Icon name="file" size={12}/><span className="ft-name">summarize.md</span></div>
          <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/tmp</span></div>
        </div>
        <div className="ft-section">Mounted</div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/data <span style={{color:'var(--muted-2)'}}>(ro)</span></span></div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/secrets</span></div>
        <div className="ft-section">System</div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/etc</span></div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/proc</span></div>
        <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/var</span></div>
      </div>
      <div className="term" ref={bodyRef} onClick={() => inputRef.current && inputRef.current.focus()}>
        <div className="term-line muted">harakiri v0.41.2 · attaching to sbx_{sbx.id.slice(4,12)}…</div>
        <div className="term-line muted">connection sealed · TTL 300s</div>
        <div className="term-line muted" style={{marginBottom:8}}>type 'exit' to terminate the sandbox</div>
        {lines.map((l, i) => (
          <div key={i} className={'term-line ' + (l.t === 'cmd' ? 'cmd' : l.t === 'mut' ? 'muted' : l.t === 'ok' ? 'ok' : l.t === 'err' ? 'err' : '')}>
            {l.s}
          </div>
        ))}
        {!running && (
          <form className="term-input" onSubmit={submit} style={{marginTop:6}}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} autoFocus />
            <span className="blink" style={{color:'#e6e3da'}}>▌</span>
          </form>
        )}
        {running && <div className="term-line muted"><span className="blink">▌</span></div>}
      </div>
      <DetailSide2 sbx={sbx} />
    </div>
  );
};

const DetailSide2 = ({ sbx }) => {
  const [cpuHist, setCpuHist] = useStateS(() => Array.from({length: 28}, () => Math.random() * 40 + 20));
  useEffectS(() => {
    if (sbx.status !== 'running') return;
    const t = setInterval(() => {
      setCpuHist(h => [...h.slice(1), Math.max(5, Math.min(95, h[h.length-1] + (Math.random()*30 - 15)))]);
    }, 1100);
    return () => clearInterval(t);
  }, [sbx.status]);

  return (
    <div className="detail-side">
      <div className="ds-section">
        <div className="ds-h">Instance</div>
        <div className="ds-row"><span className="l">vCPU</span><span className="v">2</span></div>
        <div className="ds-row"><span className="l">Memory</span><span className="v">2 GiB</span></div>
        <div className="ds-row"><span className="l">Disk</span><span className="v">10 GiB</span></div>
        <div className="ds-row"><span className="l">Kernel</span><span className="v">6.8.0-fc</span></div>
        <div className="ds-row"><span className="l">Started</span><span className="v">{sbx.started}</span></div>
        <div className="ds-row"><span className="l">TTL</span><span className="v">04:21</span></div>
      </div>

      <div className="ds-section">
        <div className="ds-h">CPU · live</div>
        <div className="ds-mini-chart">
          {cpuHist.map((v, i) => (
            <span key={i} style={{height: v + '%', background: v > 80 ? 'var(--err)' : v > 50 ? 'var(--warn)' : 'var(--ink)'}}/>
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'var(--muted)'}}>
          <span className="num">avg {Math.round(cpuHist.reduce((a,b)=>a+b,0)/cpuHist.length)}%</span>
          <span className="num">peak {Math.round(Math.max(...cpuHist))}%</span>
        </div>
      </div>

      <div className="ds-section">
        <div className="ds-h">Public URLs</div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:11, padding:'8px 10px', background:'var(--surface-2)', borderRadius:4, marginBottom:6, wordBreak:'break-all'}}>
          {sbx.id}.sandbox<br/>.harakiri.dev:8080
        </div>
        <button className="btn btn-ghost btn-sm" style={{width:'100%'}}><Icon name="copy" size={11}/> Copy URL</button>
      </div>

      <div className="ds-section">
        <div className="ds-h">Egress (last 60s)</div>
        <div className="ds-row"><span className="l">github.com</span><span className="v">14 req</span></div>
        <div className="ds-row"><span className="l">pypi.org</span><span className="v">2 req</span></div>
        <div className="ds-row"><span className="l">api.openai.com</span><span className="v">8 req</span></div>
        <div className="ds-row"><span className="l" style={{color:'var(--err)'}}>blocked</span><span className="v">0</span></div>
      </div>
    </div>
  );
};

/* FILES */
const FilesPane = ({ sbx }) => (
  <div className="term-pane">
    <div className="file-tree">
      <div className="ft-section">Workspace</div>
      <div className="ft-row"><Icon name="folder" size={12}/><span className="ft-name">/root</span></div>
      <div style={{paddingLeft:14}}>
        <div className="ft-row active"><Icon name="file" size={12}/><span className="ft-name">agent.py</span></div>
        <div className="ft-row"><Icon name="file" size={12}/><span className="ft-name">requirements.txt</span></div>
        <div className="ft-row"><Icon name="file" size={12}/><span className="ft-name">summarize.md</span></div>
      </div>
    </div>
    <div style={{background:'var(--surface)', padding:'18px 22px', overflow:'auto'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)'}}>
        <Icon name="file" size={12}/>
        <span>/root/agent.py</span>
        <span className="tag" style={{marginLeft:'auto'}}>2.1 KB</span>
        <span className="tag">python</span>
        <span className="tag">modified 2m ago</span>
      </div>
      <pre style={{margin:0, fontFamily:'var(--font-mono)', fontSize:12.5, lineHeight:1.7, color:'var(--ink)'}}>{`from harakiri.tools import read_file, search_web
from openai import OpenAI

client = OpenAI()

def run(task: str) -> str:
    """Single-turn agent. Reads task, calls a couple tools, writes a summary."""
    msg = read_file(task)
    results = search_web(msg.headline)

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=msg.body,
        tools=[search_web.spec],
    )
    return response.output_text

if __name__ == "__main__":
    import sys
    print(run(sys.argv[1]))
`}</pre>
    </div>
    <div className="detail-side">
      <div className="ds-section">
        <div className="ds-h">File</div>
        <div className="ds-row"><span className="l">Path</span><span className="v">/root/agent.py</span></div>
        <div className="ds-row"><span className="l">Size</span><span className="v">2148 B</span></div>
        <div className="ds-row"><span className="l">Lines</span><span className="v">28</span></div>
        <div className="ds-row"><span className="l">Permissions</span><span className="v">-rw-r--r--</span></div>
        <div className="ds-row"><span className="l">Modified</span><span className="v">12:04:18</span></div>
      </div>
      <div className="ds-section">
        <div className="ds-h">Actions</div>
        <button className="btn btn-sm" style={{width:'100%', marginBottom:6}}>Download</button>
        <button className="btn btn-sm" style={{width:'100%', marginBottom:6}}>Snapshot</button>
        <button className="btn btn-sm" style={{width:'100%'}}>Edit</button>
      </div>
    </div>
  </div>
);

/* LOGS */
const LogsPane = ({ sbx }) => {
  const logs = [
    { ts: '12:04:18.412', lvl: 'info', msg: 'sandbox attached, ttl=300s' },
    { ts: '12:04:18.501', lvl: 'info', msg: 'agent.py: loading model gpt-4.1-mini' },
    { ts: '12:04:18.918', lvl: 'info', msg: 'tool.read_file("summarize.md") → 4214 bytes' },
    { ts: '12:04:19.122', lvl: 'info', msg: 'http.GET https://api.openai.com/v1/responses 200 (412ms)' },
    { ts: '12:04:19.401', lvl: 'info', msg: 'tool.search_web("market sizing 2026") → 18 results' },
    { ts: '12:04:19.880', lvl: 'warn', msg: 'rate-limit headroom 12% on api.openai.com' },
    { ts: '12:04:20.114', lvl: 'info', msg: 'http.GET https://duckduckgo.com 200 (281ms)' },
    { ts: '12:04:20.412', lvl: 'info', msg: 'tool.search_web → cached, 0ms' },
    { ts: '12:04:20.918', lvl: 'info', msg: 'emitting tokens [completion stream]' },
    { ts: '12:04:21.114', lvl: 'info', msg: 'progress=42% tokens=898' },
    { ts: '12:04:21.604', lvl: 'info', msg: 'progress=78% tokens=1672' },
    { ts: '12:04:21.821', lvl: 'ok',   msg: 'task complete in 3.41s · 2148 tokens' },
    { ts: '12:04:22.001', lvl: 'info', msg: 'sandbox idle, ttl reset to 300s' },
    { ts: '12:09:21.998', lvl: 'warn', msg: 'idle 5m exceeded, sending SIGTERM' },
    { ts: '12:09:22.014', lvl: 'info', msg: 'rootfs zeroed' },
    { ts: '12:09:22.018', lvl: 'info', msg: 'sandbox terminated · disk zeroed' },
  ];
  return (
    <div className="logs-pane">
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12, alignItems:'center'}}>
        <div style={{display:'flex', gap:6}}>
          <button className="btn btn-sm active">All</button>
          <button className="btn btn-ghost btn-sm">Errors</button>
          <button className="btn btn-ghost btn-sm">Warnings</button>
          <button className="btn btn-ghost btn-sm">HTTP</button>
        </div>
        <div style={{display:'flex', gap:6}}>
          <div className="search-input" style={{width:240, height:28}}>
            <Icon name="search" size={11}/>
            <input placeholder="grep logs…"/>
          </div>
          <button className="btn btn-ghost btn-sm"><Icon name="copy" size={11}/></button>
        </div>
      </div>
      {logs.map((l, i) => (
        <div key={i} className="logs-row">
          <span className="ts">{l.ts}</span>
          <span className={'lvl ' + l.lvl}>{l.lvl.toUpperCase()}</span>
          <span>{l.msg}</span>
        </div>
      ))}
      <div style={{padding:14, color:'var(--muted)', fontSize:12, textAlign:'center', borderTop:'1px dashed var(--border)', marginTop:8}}>
        — end of log stream — <span className="num">16 lines</span>
      </div>
    </div>
  );
};

/* METRICS */
const MetricsPane = ({ sbx }) => (
  <div style={{padding:24, overflow:'auto', height:'100%'}}>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:14}}>
      <KPI label="CPU" v={sbx.cpu + '%'} delta="2vCPU allocated" />
      <KPI label="Memory" v={sbx.mem + ' MB'} delta="of 2048 MB" />
      <KPI label="Disk I/O" v="1.4 MB/s" delta="ephemeral" />
      <KPI label="Network out" v="84 KB/s" delta="2.1 MB total" />
    </div>
    <div className="card" style={{padding:22}}>
      <div className="card-h">CPU · last 5 minutes</div>
      <Chart data={Array.from({length: 200}, (_,i) => 30 + Math.sin(i/8)*15 + Math.random()*15)} />
    </div>
    <div className="card" style={{padding:22, marginTop:14}}>
      <div className="card-h">Memory · last 5 minutes</div>
      <Chart data={Array.from({length: 200}, (_,i) => 400 + i*1.2 + Math.random()*30)} />
    </div>
  </div>
);

const NetworkPane = ({ sbx }) => (
  <div style={{padding:24, overflow:'auto', height:'100%'}}>
    <div className="card" style={{padding:22, marginBottom:14}}>
      <div className="card-h">Egress allowlist</div>
      <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:12}}>
        {['github.com', '*.githubusercontent.com', 'pypi.org', 'api.openai.com', 'api.anthropic.com', 'huggingface.co', 'duckduckgo.com'].map(d =>
          <span key={d} className="tag" style={{height:22, fontSize:11.5}}>{d}</span>
        )}
        <button className="btn btn-ghost btn-sm" style={{height:22}}><Icon name="plus" size={10}/> Add</button>
      </div>
    </div>
    <div className="card" style={{padding:0}}>
      <div style={{padding:'18px 22px', borderBottom:'1px solid var(--border)'}} className="card-h">Recent requests</div>
      <div className="api-table" style={{border:0, borderRadius:0}}>
        <div className="api-table-row"><div>HOST</div><div>METHOD</div><div>STATUS · LATENCY</div></div>
        {[
          ['api.openai.com', 'POST', '200', '412ms'],
          ['github.com', 'GET', '200', '88ms'],
          ['api.openai.com', 'POST', '200', '321ms'],
          ['duckduckgo.com', 'GET', '200', '281ms'],
          ['pypi.org', 'GET', '304', '14ms'],
          ['malicious.example', 'GET', 'BLOCKED', '—'],
        ].map((r,i) => (
          <div key={i} className="api-table-row">
            <code>{r[0]}</code>
            <code><span className={'api-method ' + (r[1]==='POST'?'post':'get')}>{r[1]}</span></code>
            <code style={{color: r[2]==='BLOCKED' ? 'var(--err)' : 'var(--ink-2)'}}>{r[2]} <span style={{color:'var(--muted)'}}>· {r[3]}</span></code>
          </div>
        ))}
      </div>
    </div>
  </div>
);

window.SandboxDetail = SandboxDetail;

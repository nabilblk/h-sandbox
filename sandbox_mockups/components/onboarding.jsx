// Onboarding flow
const { useState: useStateO } = React;

const Onboarding = ({ go }) => {
  const [step, setStep] = useStateO(0);
  const steps = [
    { l: 'Account', s: 'Tell us who you are.' },
    { l: 'Workspace', s: 'Name your org and set defaults.' },
    { l: 'API key', s: 'Drop this into your .env.' },
    { l: 'Hello, sandbox', s: 'Run your first piece of code.' },
  ];
  return (
    <div className="onb">
      <div className="onb-bar">
        <Brand />
        <div className="right">
          <a onClick={() => go('landing')} style={{cursor:'pointer'}}>Exit setup →</a>
        </div>
      </div>
      <div className="onb-wrap">
        <div className="onb-steps">
          {steps.map((s, i) => (
            <div key={i}
                 className={'onb-step ' + (i === step ? 'active' : i < step ? 'done' : '')}
                 onClick={() => i < step && setStep(i)}>
              <div className="onb-num">{i < step ? <Icon name="check" size={11}/> : i+1}</div>
              <div>
                <div className="onb-step-l">{s.l}</div>
                <div className="onb-step-s">{s.s}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="onb-body">
          {step === 0 && <StepAccount onNext={() => setStep(1)} />}
          {step === 1 && <StepWorkspace onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <StepKey onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <StepHello onDone={() => go('dashboard')} onBack={() => setStep(2)} />}
        </div>
      </div>
    </div>
  );
};

const StepAccount = ({ onNext }) => (
  <div className="fade-up">
    <h1 className="onb-h">Welcome to Harakiri.</h1>
    <p className="onb-sub">Sandboxed execution for agents that occasionally write things they shouldn't run on your laptop. Let's get you set up in about 90 seconds.</p>
    <div className="onb-section" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:560}}>
      <Field label="Full name"><input className="input" defaultValue="Lyra Ito" /></Field>
      <Field label="Work email"><input className="input" defaultValue="lyra@k.ai" /></Field>
      <Field label="What are you building?">
        <select className="input">
          <option>An AI agent / autonomous system</option>
          <option>A code interpreter feature</option>
          <option>An eval harness</option>
          <option>A devtool for other engineers</option>
          <option>Something else</option>
        </select>
      </Field>
      <Field label="Team size">
        <select className="input">
          <option>Just me</option>
          <option>2 — 10</option>
          <option>11 — 50</option>
          <option>51 — 200</option>
          <option>200+</option>
        </select>
      </Field>
    </div>

    <div className="onb-foot">
      <button className="btn btn-primary" onClick={onNext}>Continue <Icon name="arrowR" size={11}/></button>
    </div>
  </div>
);

const StepWorkspace = ({ onNext, onBack }) => {
  const [defaultTmpl, setDefaultTmpl] = useStateO('python-3.12');
  return (
    <div className="fade-up">
      <h1 className="onb-h">Your workspace.</h1>
      <p className="onb-sub">Sandboxes live in an org. Pick a name and the template you'll boot most often — you can always change it.</p>

      <div className="onb-section" style={{maxWidth:560}}>
        <Field label="Organization name">
          <input className="input" defaultValue="lyra-labs" />
        </Field>
        <div style={{height:14}}/>
        <Field label="Slug" hint="Used in your API endpoint. Lowercase, no spaces.">
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize:12}}>api.harakiri.dev/v1/</span>
            <input className="input mono" defaultValue="lyra-labs" style={{flex:1}} />
          </div>
        </Field>
      </div>

      <div className="onb-section">
        <div className="field-l" style={{marginBottom:8}}>Default template</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, maxWidth:560}}>
          {[
            ['python-3.12',      'Python 3.12',      'Bare Python + uv'],
            ['python-3.12-data', 'Python (data)',    'numpy, pandas, polars'],
            ['node-20',          'Node 20',          'Node + pnpm + bun'],
          ].map(([k, l, sub]) => (
            <button key={k} className={'tmpl-pick-c ' + (defaultTmpl === k ? 'active' : '')}
                    style={{flexDirection:'column', alignItems:'flex-start', gap:2, padding:'12px 14px'}}
                    onClick={() => setDefaultTmpl(k)}>
              <div className="num" style={{fontSize:11, color:'var(--muted)', fontWeight:600}}>{k}</div>
              <div style={{fontWeight:600}}>{l}</div>
              <div style={{fontSize:11.5, color:'var(--muted)'}}>{sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="onb-foot">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext}>Continue <Icon name="arrowR" size={11}/></button>
      </div>
    </div>
  );
};

const StepKey = ({ onNext, onBack }) => {
  const [copied, setCopied] = useStateO(false);
  const key = 'hk_live_28fcf__c81ed_b0a4e_771b3_44a09_REDACTED';
  return (
    <div className="fade-up">
      <h1 className="onb-h">Your first API key.</h1>
      <p className="onb-sub">This is the only time we'll show this in full. Drop it into your <code>.env</code> file, or save it in a secrets manager.</p>

      <div className="onb-section">
        <div className="card" style={{padding:'16px 18px', display:'flex', alignItems:'center', gap:14, maxWidth:680}}>
          <Icon name="key" size={16} style={{color:'var(--accent)', flexShrink:0}} />
          <div style={{fontFamily:'var(--font-mono)', fontSize:13, flex:1, wordBreak:'break-all'}}>{key}</div>
          <button className="btn btn-sm" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <><Icon name="check" size={11}/> Copied</> : <><Icon name="copy" size={11}/> Copy</>}
          </button>
        </div>
        <div style={{marginTop:12, fontSize:12, color:'var(--muted)', display:'flex', gap:8, alignItems:'center'}}>
          <Icon name="lock" size={11}/>
          <span>Scoped to <b>lyra-labs</b>. Rotate or revoke anytime in Settings → API keys.</span>
        </div>
      </div>

      <div className="onb-section">
        <div className="field-l" style={{marginBottom:8}}>Install the SDK</div>
        <pre style={{margin:0, background:'#18181a', color:'#e6e3da', padding:'14px 18px', borderRadius:'var(--r-md)', fontFamily:'var(--font-mono)', fontSize:12.5, maxWidth:680}}>{`$ pip install harakiri
$ export HK_KEY="hk_live_28fcf__c81ed_b0a4e..."`}</pre>
      </div>

      <div className="onb-foot">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext}>Continue <Icon name="arrowR" size={11}/></button>
      </div>
    </div>
  );
};

const StepHello = ({ onDone, onBack }) => {
  const [phase, setPhase] = useStateO('idle');
  const [out, setOut] = useStateO([]);
  const start = () => {
    setPhase('booting');
    const seq = [
      [400,  '→ POST /v1/sandboxes  template=python-3.12'],
      [600,  '→ provisioning microVM… 142ms'],
      [400,  '→ id=sbx_4a8c1pqr2x  url=sbx_4a8c1pqr2x.sandbox.harakiri.dev'],
      [500,  ''],
      [400,  '$ harakiri run --code "print(2+2)"'],
      [700,  '4'],
      [400,  ''],
      [500,  '$ harakiri kill'],
      [400,  '→ sandbox terminated · disk zeroed · runtime 1.41s'],
    ];
    let delay = 0;
    seq.forEach(([d, line], i) => {
      delay += d;
      setTimeout(() => {
        setOut(o => [...o, line]);
        if (i === seq.length - 1) setPhase('done');
      }, delay);
    });
  };
  return (
    <div className="fade-up">
      <h1 className="onb-h">Hello, sandbox.</h1>
      <p className="onb-sub">Let's spawn your first sandbox, run a single Python expression, and end it. The whole round-trip should be under 2 seconds.</p>

      <div className="onb-section">
        <div className="hterm card" style={{maxWidth:780}}>
          <div className="hterm-bar">
            <span className="dot r"/><span className="dot y"/><span className="dot g"/>
            <span className="hterm-title">first-sandbox.py</span>
            {phase === 'booting' && <span className="pill live" style={{marginLeft:'auto'}}><span className="dot"/> running</span>}
            {phase === 'done' && <span className="pill" style={{marginLeft:'auto'}}><span className="dot"/> terminated</span>}
            {phase === 'idle' && <span className="pill" style={{marginLeft:'auto', color:'var(--muted)'}}><span className="dot"/> ready</span>}
          </div>
          <div className="hterm-body" style={{minHeight:280}}>
            {phase === 'idle' && (
              <>
                <div className="hterm-line muted"># Click "Run" to spawn your first sandbox</div>
                <div className="hterm-line">from harakiri import Sandbox</div>
                <div className="hterm-line">sbx = Sandbox.create(template="python-3.12")</div>
                <div className="hterm-line">print(sbx.run("print(2+2)").stdout)</div>
                <div className="hterm-line">sbx.kill()</div>
              </>
            )}
            {phase !== 'idle' && out.map((l, i) => (
              <div key={i} className={'hterm-line ' + (l.startsWith('→') ? 'muted' : '')}>
                {l || '\u00a0'}
              </div>
            ))}
            {phase === 'booting' && <div className="hterm-line"><span className="blink">▌</span></div>}
          </div>
        </div>
      </div>

      <div className="onb-foot">
        <button className="btn" onClick={onBack}>Back</button>
        {phase === 'idle' && (
          <button className="btn btn-accent" onClick={start}>
            <Icon name="play" size={11}/> Run first sandbox
          </button>
        )}
        {phase === 'booting' && (
          <button className="btn" disabled><span className="spinner"/> Running…</button>
        )}
        {phase === 'done' && (
          <button className="btn btn-primary" onClick={onDone}>Open dashboard <Icon name="arrowR" size={11}/></button>
        )}
      </div>
    </div>
  );
};

window.Onboarding = Onboarding;

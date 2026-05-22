// App root — handles routing via URL hash + tweaks
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#b8331f",
  "density": "regular",
  "fontPair": "hanken"
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = ['#b8331f', '#0f0f0e', '#2563eb', '#6e44d4'];

function App() {
  const [route, setRoute] = useStateA(() => location.hash.slice(1) || 'landing');
  const [sbxId, setSbxId]   = useStateA('sbx_jt29kf01x4');
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffectA(() => {
    location.hash = route;
  }, [route]);

  useEffectA(() => {
    const onHash = () => setRoute(location.hash.slice(1) || 'landing');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Apply tweaks
  useEffectA(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--font-sans',
      t.fontPair === 'hanken' ? '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif' :
      t.fontPair === 'mono'   ? '"JetBrains Mono", ui-monospace, monospace' :
                                 '"Fraunces", "Hanken Grotesk", serif'
    );
    document.documentElement.style.setProperty('font-size',
      t.density === 'compact' ? '13px' :
      t.density === 'comfy'   ? '15px' : '14px'
    );
  }, [t]);

  const go = (r) => { setRoute(r); window.scrollTo(0, 0); };
  const openSandbox = (id) => { setSbxId(id); go('detail'); };

  let view;
  if (route === 'landing') view = <Landing go={go} />;
  else if (route === 'onboarding') view = <Onboarding go={go} />;
  else if (route.startsWith('dashboard')) view = <Dashboard go={go} route={route} openSandbox={openSandbox} />;
  else if (route === 'detail') view = <SandboxDetail go={go} sbxId={sbxId} openSandbox={openSandbox} />;
  else if (route === 'docs') view = <Docs go={go} />;
  else view = <Landing go={go} />;

  return (
    <>
      {view}
      <TweaksPanel>
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_OPTIONS}
                    onChange={v => setTweak('accent', v)} />
        <TweakSection label="Type" />
        <TweakRadio label="Pairing" value={t.fontPair}
                    options={[{value:'hanken', label:'Sans'}, {value:'serif', label:'Serif'}, {value:'mono', label:'Mono'}]}
                    onChange={v => setTweak('fontPair', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density}
                    options={[{value:'compact', label:'Compact'}, {value:'regular', label:'Regular'}, {value:'comfy', label:'Comfy'}]}
                    onChange={v => setTweak('density', v)} />
        <TweakSection label="Jump to" />
        <TweakButton label="Landing" onClick={() => go('landing')} />
        <TweakButton label="Onboarding" onClick={() => go('onboarding')} />
        <TweakButton label="Dashboard" onClick={() => go('dashboard')} />
        <TweakButton label="Sandbox detail" onClick={() => go('detail')} />
        <TweakButton label="Docs" onClick={() => go('docs')} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

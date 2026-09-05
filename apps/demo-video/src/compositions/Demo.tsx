import { useEffect, useState } from 'react';
import { AbsoluteFill, Img, Sequence, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Video } from '@remotion/media';
import type { Capture, Checkpoint } from '../data/capture-schema';
import { chapters, fps, type Scene } from '../data/storyboard';

export type DemoProps = { capture: Capture | null };
type Tokens = Record<string, string>;

export function useDesign() {
  const [handle] = useState(() => delayRender('Loading local Harakiri design assets'));
  const [tokens, setTokens] = useState<Tokens>({});
  useEffect(() => {
    void (async () => {
      const values = await (await fetch(staticFile('design/tokens.json'))).json();
      await loadFont({ family: 'Hanken Grotesk', url: staticFile('fonts/hanken-grotesk-latin-wght-normal.woff2'), weight: '100 900' });
      await loadFont({ family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-wght-normal.woff2'), weight: '100 800' });
      setTokens(values);
      continueRender(handle);
    })().catch(cancelRender);
  }, [handle]);
  return tokens;
}

function Footage({ point }: { point: Checkpoint }) {
  const style = { position: 'absolute' as const, width: '100%', height: '100%', objectFit: 'contain' as const, top: 0, left: 0 };
  const frames = Math.min(90, Math.floor(point.durationMs / 1000 * fps));
  return <AbsoluteFill style={{ overflow: 'hidden', background: '#fff' }}>
    <Sequence durationInFrames={frames}><Video src={staticFile(`capture/${point.video}`)} muted style={style} /></Sequence>
    <Sequence from={frames}><Img src={staticFile(`capture/${point.image}`)} style={style} /></Sequence>
  </AbsoluteFill>;
}

function Terminal({ command, output }: { command: string; output: string }) {
  const frame = useCurrentFrame();
  const lines = output.trim().split('\n');
  const visible = Math.min(lines.length, Math.max(0, Math.floor((frame - 18) / 9)));
  return <AbsoluteFill style={{ background: '#171719', color: '#fafaf7', padding: '46px 58px', font: '28px/1.55 "JetBrains Mono"', overflow: 'hidden' }}>
    <div style={{ fontSize: 18, color: '#aaa', marginBottom: 22 }}>PUBLISHED CLI / RECORDED OUTPUT</div>
    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}><span style={{ color: '#a0d2b5' }}>$ </span>{command}</div>
    <pre style={{ margin: '28px 0 0', font: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#cbd9d1' }}>{lines.slice(0, visible).join('\n')}</pre>
  </AbsoluteFill>;
}

function Content({ scene, capture }: { scene: Scene; capture: Capture }) {
  const event = (name: string) => {
    const found = capture.events.find((entry) => entry.name === name);
    if (!found) throw new Error(`Missing source event ${name}`);
    return found;
  };
  if (scene === 'create') {
    const create = event('create');
    const idLine = create.stdout.split('\n').find((line) => line === capture.sandbox.id)!;
    return <Terminal command={`${event('version').command}\n${event('login').command}\n${create.command}`} output={`${event('version').stdout.trim()}\n\n${idLine}`} />;
  }
  if (scene === 'attach') return <Terminal command={capture.terminal.command} output={capture.terminal.stdout} />;
  if (scene === 'start') return <Terminal command={`${event('upload-server').command}\n${event('start').command}`} output={event('start').stdout} />;
  if (scene === 'expose') return <Terminal command={event('expose').command} output={event('expose').stdout} />;
  if (scene === 'cleanup') return <>
    <Footage point={capture.checkpoints.find((point) => point.name === 'terminated')!} />
    <div style={{ position: 'absolute', left: 32, right: 32, bottom: 32, background: '#171719', color: '#fafaf7', padding: '26px 32px', font: '26px/1.5 "JetBrains Mono"' }}>
      $ {event('kill').command}<br /><span style={{ color: '#a0d2b5' }}>Verified: sandbox terminated / route inactive</span>
    </div>
  </>;
  const name = scene === 'intro' ? 'preview' : scene;
  return <Footage point={capture.checkpoints.find((point) => point.name === name)!} />;
}

function Frame({ scene, title, capture, tokens }: { scene: Scene; title: string; capture: Capture; tokens: Tokens }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const chapter = chapters.find((item) => item.scene === scene)!;
  return <AbsoluteFill style={{ background: tokens.bg, color: tokens.ink, padding: '36px 56px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 46 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontWeight: 650, fontSize: 28 }}><Img src={staticFile('brand/mark.svg')} style={{ width: 40, height: 40 }} />harakiri</div>
      <div style={{ font: '18px "JetBrains Mono"', color: tokens.muted }}>REAL PRODUCT CAPTURE / CLI {capture.cliVersion}</div>
    </div>
    <div style={{ marginTop: 28, marginBottom: 24, opacity }}>
      <h1 style={{ fontSize: 54, fontWeight: 600, margin: 0, lineHeight: 1.1 }}>{title}</h1>
      <div style={{ marginTop: 14, font: '22px "JetBrains Mono"', color: tokens.muted }}>{capture.sandbox.template} <span style={{ color: tokens.accent }}> / </span> {capture.sandbox.id}</div>
    </div>
    <div style={{ position: 'relative', height: 716, width: '100%', border: `1px solid ${tokens['border-strong']}`, borderRadius: 6, overflow: 'hidden' }}><Content scene={scene} capture={capture} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, fontSize: 21, color: tokens.muted }}>
      <span>{chapter.caption}</span>
      <span style={{ whiteSpace: 'nowrap', marginLeft: 26, font: '17px "JetBrains Mono"' }}>WAITING TIME EDITED</span>
    </div>
  </AbsoluteFill>;
}

export function HarakiriProductDemo({ capture }: DemoProps) {
  const tokens = useDesign();
  if (!capture) throw new Error('A reviewed live capture is required');
  return <AbsoluteFill>{chapters.map((chapter) => <Sequence key={chapter.scene} from={chapter.start * fps} durationInFrames={(chapter.end - chapter.start) * fps} premountFor={fps}>
    <Frame {...chapter} capture={capture} tokens={tokens} />
  </Sequence>)}</AbsoluteFill>;
}
export function HarakiriHeroLoop({ capture }: DemoProps) {
  const tokens = useDesign();
  if (!capture) throw new Error('A reviewed live capture is required');
  return <AbsoluteFill style={{ background: tokens.bg }}>{(['preview', 'terminal', 'network', 'preview'] as const).map((scene, index) => <Sequence key={index} from={index * 105} durationInFrames={105} premountFor={fps}>
    <div style={{ position: 'absolute', top: 350, left: 64, right: 64, bottom: 0, overflow: 'hidden' }}><Content scene={scene} capture={capture} /></div>
  </Sequence>)}</AbsoluteFill>;
}

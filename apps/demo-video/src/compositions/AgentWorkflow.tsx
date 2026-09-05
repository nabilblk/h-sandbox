import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Video } from '@remotion/media';
import { useDesign } from './Demo';
import type { Workflow, WorkflowScene } from '../data/workflow-schema';

export type WorkflowProps = { workflow: Workflow | null };
const mono = '"JetBrains Mono", monospace';

function Panel({ scene, workflow }: { scene: WorkflowScene; workflow: Workflow }) {
  const frame = useCurrentFrame();
  const dark = scene.kind !== 'footage' && scene.kind !== 'result';
  const lines = scene.content.split('\n');
  const reveal = Math.min(lines.length, Math.max(0, Math.floor((frame - 14) / 8)));
  if (scene.kind === 'image') {
    return <AbsoluteFill style={{ background: '#edf1ef', padding: '24px 32px' }}>
      <div style={{ font: `20px ${mono}`, color: '#515c62', marginBottom: 16 }}>{scene.label}</div>
      <Img src={staticFile(`workflows/${workflow.id}/${scene.image}`)} style={{ width: '100%', flex: 1, minHeight: 0, objectFit: 'contain' }} />
    </AbsoluteFill>;
  }
  if (scene.kind === 'overview') {
    const active = Math.min(2, Math.floor(frame / (scene.seconds * 30 / 3)));
    return <AbsoluteFill data-scene-panel style={{ background: '#fff', padding: '48px 54px', justifyContent: 'center' }}>
      <div style={{ font: `21px ${mono}`, color: '#6b7175', marginBottom: 56 }}>{scene.label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid #d9dfe1' }}>
        {scene.steps!.map((step, index) => <section key={step.title} style={{ padding: '40px 30px', borderRight: index < 2 ? '1px solid #d9dfe1' : undefined }}>
          <div style={{ font: `24px ${mono}`, color: index === active ? '#b73325' : '#67737a', marginBottom: 24 }}>{String(index + 1).padStart(2, '0')}</div>
          <h2 style={{ margin: '0 0 24px', fontSize: 42, lineHeight: 1.15, fontWeight: 600 }}>{step.title}</h2>
          <p style={{ margin: 0, fontSize: 30, lineHeight: 1.5, color: '#515c62' }}>{step.detail}</p>
        </section>)}
      </div>
    </AbsoluteFill>;
  }
  if (scene.kind === 'footage') {
    const frames = Math.floor(scene.footageSeconds! * 30);
    const style = { width: '100%', height: '100%', objectFit: 'contain' as const };
    return <AbsoluteFill style={{ background: '#fff', overflow: 'hidden' }}>
      <Sequence durationInFrames={frames}><Video src={staticFile(`workflows/${workflow.id}/${scene.video}`)} muted style={style} /></Sequence>
      <Sequence from={frames}><Img src={staticFile(`workflows/${workflow.id}/${scene.image}`)} style={style} /></Sequence>
    </AbsoluteFill>;
  }
  return <AbsoluteFill data-scene-panel style={{ background: dark ? '#181a1c' : '#f0f6f2', color: dark ? '#f0f1f2' : '#183c2a', padding: '40px 46px', justifyContent: lines.length <= 7 && !scene.command ? 'center' : 'flex-start' }}>
    <div style={{ font: `21px ${mono}`, color: dark ? '#a5a9ad' : '#526e5b', marginBottom: 28 }}>{scene.label}</div>
    {scene.command && <div style={{ font: `30px/1.5 ${mono}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 30 }}><span style={{ color: '#75d5a5' }}>$ </span>{scene.command}</div>}
    <div data-scene-content style={{ display: 'grid', gap: scene.kind === 'tools' ? 14 : 0, font: `${scene.fontSize ?? (scene.kind === 'result' ? 43 : scene.kind === 'tools' ? 39 : 31)}px/1.55 ${mono}` }}>
      {lines.map((line, index) => <div key={index} style={{ opacity: index < reveal ? 1 : 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: line.startsWith('- ') || line.startsWith('not ok') ? '#ffaaaa' : line.startsWith('+ ') || line.startsWith('ok ') ? '#8fe2b6' : undefined }}>
        {scene.kind === 'tools' ? <span style={{ color: '#7d838a', display: 'inline-block', width: 62 }}>{String(index + 1).padStart(2, '0')}</span> : null}{line || ' '}
      </div>)}
    </div>
  </AbsoluteFill>;
}

function Chapter({ scene, workflow, index, start }: { scene: WorkflowScene; workflow: Workflow; index: number; start: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7], [0, 1], { extrapolateRight: 'clamp' });
  const total = workflow.scenes.reduce((sum, item) => sum + item.seconds, 0);
  return <AbsoluteFill style={{ background: '#f8f9f8', color: '#161819', padding: '32px 48px' }}>
    <header style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 29, fontWeight: 650 }}><Img src={staticFile('brand/mark.svg')} style={{ width: 36, height: 36 }} />harakiri <span style={{ color: '#b73325', marginLeft: 20, font: `21px ${mono}` }}>{workflow.surface} / OPENCODE</span></div>
      <span style={{ color: '#727778', font: `19px ${mono}` }}>{workflow.title}</span>
    </header>
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, margin: '26px 0 24px', opacity }}>
      <span style={{ color: '#b73325', font: `24px ${mono}` }}>{String(index + 1).padStart(2, '0')}</span>
      <h1 style={{ fontSize: 49, lineHeight: 1.15, fontWeight: 600, margin: 0 }}>{scene.title}</h1>
    </div>
    <div style={{ position: 'relative', width: '100%', height: 768, border: '1px solid #d8dcdc', borderRadius: 6, overflow: 'hidden' }}><Panel scene={scene} workflow={workflow} /></div>
    <footer style={{ marginTop: 23, fontSize: 23, lineHeight: 1.3, color: '#555c5e', display: 'flex', justifyContent: 'space-between', gap: 30 }}>
      <span style={{ maxWidth: 1440 }}>{scene.caption}</span><span style={{ flexShrink: 0, font: `16px/1.8 ${mono}` }}>REAL EXECUTION<br />WAITING EDITED</span>
    </footer>
    <div style={{ position: 'absolute', height: 4, background: '#b73325', left: 0, bottom: 0, width: `${Math.min(100, (start + frame / 30) / total * 100)}%` }} />
  </AbsoluteFill>;
}

export function AgentWorkflow({ workflow }: WorkflowProps) {
  useDesign();
  if (!workflow) throw new Error('Verified agent workflow required');
  let start = 0;
  return <AbsoluteFill>{workflow.scenes.map((scene, index) => {
    const from = start; start += scene.seconds;
    return <Sequence key={index} from={from * 30} durationInFrames={scene.seconds * 30}><Chapter scene={scene} workflow={workflow} index={index} start={from} /></Sequence>;
  })}</AbsoluteFill>;
}

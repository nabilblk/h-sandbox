import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video } from '@remotion/media';
import type { UiTour } from '../data/ui-tour-schema';

function RecordedScene({ clip }: { clip: UiTour['clips'][number] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const point = [...clip.pointer].reverse().find((entry) => entry.at <= seconds);
  const age = point ? seconds - point.at : 2;
  return <AbsoluteFill style={{ background: '#fafafa' }}>
    <Video src={staticFile(`ui-product-tour/${clip.file}`)} muted onError={() => 'fail'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    {point && age < 1.1 ? <div style={{ position: 'absolute', left: point.x - 13, top: point.y - 13, width: 26, height: 26, borderRadius: '50%', border: `2px solid ${point.click ? '#bd2b22' : '#171917'}`, boxShadow: '0 0 0 2px #ffffff', opacity: Math.min(1, (1.1 - age) * 3), pointerEvents: 'none' }} /> : null}
  </AbsoluteFill>;
}

export function UiProductTour({ tour }: { tour: UiTour | null }) {
  if (!tour) throw new Error('A reviewed real capture is required');
  let start = 0;
  return <AbsoluteFill>{tour.clips.map((clip) => {
    const from = start;
    start += clip.seconds * 30;
    return <Sequence key={clip.id} from={from} durationInFrames={clip.seconds * 30} premountFor={15}><RecordedScene clip={clip} /></Sequence>;
  })}</AbsoluteFill>;
}

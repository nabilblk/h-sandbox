import './index.css';
import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion';
import { requirePublishable } from './data/capture-schema';
import { HarakiriProductDemo, HarakiriHeroLoop, type DemoProps } from './compositions/Demo';
import { fullDuration, heroDuration, fps } from './data/storyboard';
import { AgentWorkflow } from './compositions/AgentWorkflow';
import { workflowIds, workflowSchema } from './data/workflow-schema';
import { UiProductTour } from './compositions/UiProductTour';
import { uiTourSchema } from './data/ui-tour-schema';
import { uiProductTourSeconds } from '../../web/src/ui-product-tour';

const metadata: CalculateMetadataFunction<DemoProps> = async ({ abortSignal }) => {
  const response = await fetch(staticFile('capture/capture.json'), { signal: abortSignal });
  if (!response.ok) throw new Error('Approve a live capture before opening the compositions.');
  return { props: { capture: requirePublishable(await response.json()) } };
};
export const RemotionRoot = () => <>
  <Composition id="ui-product-tour" component={UiProductTour} width={1920} height={1080} fps={30} durationInFrames={uiProductTourSeconds * 30} defaultProps={{ tour: null }} calculateMetadata={async ({ abortSignal }) => {
    const response = await fetch(staticFile('ui-product-tour/tour.json'), { signal: abortSignal });
    if (!response.ok) throw new Error('Review and prepare the UI product tour capture first.');
    return { props: { tour: uiTourSchema.parse(await response.json()) } };
  }} />
  {workflowIds.map((id) => <Composition key={id} id={id} component={AgentWorkflow} width={1920} height={1080} fps={30} durationInFrames={2400} defaultProps={{ workflow: null }} calculateMetadata={async ({ abortSignal }) => {
    const response = await fetch(staticFile(`workflows/${id}/workflow.json`), { signal: abortSignal });
    if (!response.ok) throw new Error(`Missing verified capture: ${id}`);
    const workflow = workflowSchema.parse(await response.json());
    return { props: { workflow }, durationInFrames: workflow.scenes.reduce((sum, scene) => sum + scene.seconds, 0) * 30 };
  }} />)}
  <Composition id="HarakiriProductDemo" component={HarakiriProductDemo} width={1920} height={1080} fps={fps} durationInFrames={fullDuration * fps} defaultProps={{ capture: null }} calculateMetadata={metadata} />
  <Composition id="HarakiriHeroLoop" component={HarakiriHeroLoop} width={1920} height={1080} fps={fps} durationInFrames={heroDuration * fps} defaultProps={{ capture: null }} calculateMetadata={metadata} />
</>;

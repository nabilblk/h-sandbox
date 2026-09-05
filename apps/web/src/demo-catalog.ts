import { sdkDemoSteps } from './sdk-demo-walkthrough';
import { cliDemoSteps } from './cli-demo-walkthrough';
import { uiDemoSteps } from './ui-demo-walkthrough';
import { browserDemoSteps } from './browser-demo-walkthrough';
import { walkthroughTiming } from './demo-walkthrough';

export type Demo = {
  id: string;
  title: string;
  surface: "CLI" | "UI" | "SDK";
  summary: string;
  seconds: number;
  video: string;
  poster: string;
  captions: string;
  transcript: string;
  provenance: string;
  tutorialId: string;
  source: string;
  chapters: { start: number; title: string }[];
};

const entries = [
  { id: "cli-agent-repair", title: "Repair a bug from the CLI", surface: "CLI" as const,
    summary: "OpenCode fixes an invoice calculation. Three failures become four passes, with the original tests unchanged.",
    ...walkthroughTiming(cliDemoSteps) },
  { id: "ui-agent-app", title: "Build an app from the dashboard", surface: "UI" as const,
    summary: "Ask OpenCode to build a release dashboard, expose its preview, test the filter, and terminate the sandbox.",
    ...walkthroughTiming(uiDemoSteps) },
  { id: "sdk-agent-report", title: "Turn data into a verified report", surface: "SDK" as const,
    summary: "A complete Node.js worker: the use case, full agent prompt and command, real OpenCode tools, verified downloads, and cleanup.",
    ...walkthroughTiming(sdkDemoSteps) },
  { id: "browser-agent-qa", title: "Let an agent test your web app", surface: "SDK" as const,
    summary: "OpenCode writes Playwright tests. Run Chromium inside Harakiri, download screenshots, and prove a broken filter fails.",
    ...walkthroughTiming(browserDemoSteps) },
];

export const demos: Demo[] = entries.map((entry) => {
  const revision = '?v=20260905-four-workflows-1';
  const asset = (name: string) => `/demos/${entry.id}/${name}${revision}`;
  return {
    ...entry, video: asset('video.mp4'), poster: asset('poster.webp'),
    captions: asset('captions.vtt'), transcript: asset('transcript.md'),
    provenance: asset('provenance.json'), tutorialId: entry.id,
    source: '/demos/agent-workflows.zip?v=20260905-four-workflows-1',
  };
});

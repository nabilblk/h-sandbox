import type { CodeLanguage } from "./components/docs-code";

export type DemoStep = {
  id: string; title: string; chapter: string; seconds: number;
  text: string; code: string; check: string;
  language: CodeLanguage;
};

export function walkthroughTiming(steps: DemoStep[]) {
  let seconds = 0;
  const chapters = steps.map((step) => {
    const start = seconds;
    seconds += step.seconds;
    return { start, title: step.chapter };
  });
  return { seconds, chapters };
}

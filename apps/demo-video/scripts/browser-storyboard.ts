import assert from 'node:assert/strict';
import type { WorkflowScene } from '../src/data/workflow-schema.js';
import { browserDemoSteps, browserPromptLines } from '../../web/src/browser-demo-walkthrough.js';

export function browserStoryboard(source: any): WorkflowScene[] {
  assert.equal(source.prompt, browserPromptLines.join('\n'));
  assert.equal(source.agentCommand, `opencode run --format json --model ${source.model} '${source.prompt.replaceAll("'", "'\\''")}'`);
  assert.equal(source.inputUnchanged, true);
  assert.equal(source.testUnchanged, true);
  assert.deepEqual(source.report, { initialRows: 3, passedNames: ['Portal'], restoredRows: 3, mobileOverflow: false });
  assert.ok(Number.isInteger(source.mutationExitCode) && source.mutationExitCode !== 0);
  assert.match(source.mutationOutput, /AssertionError|ERR_ASSERTION/);
  assert.ok(source.agent.tools.length && source.agent.tools.every((tool: any) => tool.status === 'completed'));
  return browserDemoSteps.map((step) => {
    const scene: WorkflowScene = { title: step.title, seconds: step.seconds, caption: step.check, kind: 'code', label: 'browser-qa.mjs / SOURCE EXCERPT', content: step.code, fontSize: 31 };
    if (step.id === 'use-case' || step.id === 'boundary') {
      scene.kind = 'overview'; scene.label = 'BROWSER QA / CURRENT COMMANDS AND FILES CAPABILITIES';
      scene.steps = step.id === 'use-case' ? [
        { title: 'A preview contract', detail: 'An existing release board. Three rows, a working filter and a mobile layout to verify.' },
        { title: 'Agent-written tests', detail: 'OpenCode writes qa.mjs. Playwright drives real Chromium and produces screenshots.' },
        { title: 'A regression gate', detail: 'Rerun the suite. Break the filter deliberately and require the same tests to reject it.' },
      ] : [
        { title: 'Your Node worker', detail: 'Published SDK. Upload fixtures, track commands, compare bytes and download artifacts.' },
        { title: 'One sandbox', detail: 'OpenCode, Node and Chromium. Local-only HTTP app. No public browser or agent endpoint.' },
        { title: 'External free model', detail: 'Receives synthetic task context. No paid key or managed browser subscription.' },
      ];
    } else if (step.id === 'desktop' || step.id === 'mobile') {
      scene.kind = 'image'; scene.image = `${step.id}.png`;
      scene.label = `${step.id}.png / ACTUAL CHROMIUM OUTPUT / DOWNLOADED THROUGH SDK`;
    } else if (step.id === 'result') {
      scene.kind = 'result'; scene.label = 'RECORDED RUN / INDEPENDENT VERIFICATION'; scene.fontSize = 39;
      scene.content = `Original app      passed\nBroken filter     assertion failed (exit ${source.mutationExitCode})\nSource and tests  unchanged\nArtifacts         desktop.png / mobile.png\nModel steps       zero reported cost`;
    } else if (step.id === 'generated-test') {
      const lines = source.testSource.split('\n').filter((line: string) => /page\.selectOption\('#status', 'passed'\)|const passedNames|assert\.deepEqual\(passedNames/.test(line));
      assert.equal(lines.length, 3, 'Review the new agent implementation before publishing its assertion excerpt');
      scene.label = 'qa.mjs / RECORDED AGENT-WRITTEN ASSERTION EXCERPT';
      scene.content = lines.map((line: string) => line.trim()).join('\n\n');
    } else if (step.id === 'install') {
      scene.label = `REMOTE SETUP / ${source.setupSeconds}s IN THIS RUN / WAITING EDITED`;
    } else if (step.id.startsWith('prompt-')) {
      scene.label = `browser-prompt.txt / COMPLETE PROMPT / PART ${step.id === 'prompt-actions' ? 1 : 2} OF 2`;
    }
    return scene;
  });
}

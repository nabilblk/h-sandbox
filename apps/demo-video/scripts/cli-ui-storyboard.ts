import assert from 'node:assert/strict';
import type { WorkflowScene } from '../src/data/workflow-schema.js';
import type { DemoStep } from '../../web/src/demo-walkthrough.js';
import { cliDemoPrompt, cliDemoSteps } from '../../web/src/cli-demo-walkthrough.js';
import { uiDemoPrompt, uiDemoSteps } from '../../web/src/ui-demo-walkthrough.js';
import { verifyRepair } from './agent-evidence.js';

function base(step: DemoStep): WorkflowScene {
  return { title: step.title, seconds: step.seconds, caption: step.check, kind: 'code', label: 'REPRODUCTION COMMANDS / SEE COMPLETE TUTORIAL', content: step.code, fontSize: 31 };
}

export function cliStoryboard(source: any): WorkflowScene[] {
  assert.equal(source.prompt, cliDemoPrompt);
  verifyRepair(source.before, source.after, source.initialHash, source.finalHash, source.diff);
  const event = (name: string) => {
    const found = source.events.find((item: any) => item.name === name);
    assert.ok(found, `Missing recorded ${name}`); return found;
  };
  assert.ok(event('agent-start').command.includes(cliDemoPrompt));
  return cliDemoSteps.map((step) => {
    const scene = base(step);
    if (step.id === 'use-case' || step.id === 'boundary') {
      scene.kind = 'overview'; scene.label = 'A DEVELOPER WORKFLOW / SYNTHETIC TASK';
      scene.steps = step.id === 'use-case' ? [
        { title: 'A failing calculation', detail: 'Discounts are ignored. Four existing tests define correct rounding and shipping behavior.' },
        { title: 'An agent repair', detail: 'OpenCode reads the task, edits the implementation and runs the Node test suite.' },
        { title: 'Independent acceptance', detail: 'Rerun the original tests. Compare the test hash and inspect the implementation diff.' },
      ] : [
        { title: 'Your terminal', detail: 'Published Harakiri CLI. Holds your API key and sends files and commands through the control plane.' },
        { title: 'Remote sandbox', detail: 'OpenCode, Node and Git work in /workspace. No local project mount or Kubernetes exec.' },
        { title: 'External model', detail: 'OpenCode calls the explicit free provider. Only synthetic source and tests are used.' },
      ];
    } else if (step.id === 'baseline' || step.id === 'verify') {
      scene.kind = 'terminal'; scene.label = 'RECORDED NODE TEST OUTPUT / EXCERPT';
      scene.command = 'harakiri run "$SBX" --cwd /workspace --cmd "node --test invoice.spec.mjs"';
      scene.content = event(step.id === 'baseline' ? 'tests-before' : 'tests-after').stdout.split('\n').filter((line: string) => /^(not ok|ok \d|# (tests|pass|fail))/.test(line)).join('\n');
    } else if (step.id === 'tools') {
      scene.kind = 'tools'; scene.label = 'RECORDED COMPLETED TOOLS / COMMAND EXCERPTS';
      scene.content = source.agent.tools.map((tool: any) => `${tool.tool.padEnd(8)} ${String(tool.input?.filePath ?? tool.input?.command ?? '').split('\n')[0].slice(0, 78)}`).join('\n');
    } else if (step.id === 'prompt') {
      scene.label = 'cli-prompt.txt / COMPLETE PROMPT';
    } else if (step.id === 'result') {
      scene.kind = 'result'; scene.label = 'RECORDED REPAIR / INDEPENDENT ASSERTIONS'; scene.fontSize = 39;
      scene.content = 'Before       1 passed / 3 failed\nAfter        4 passed / 0 failed\nTest SHA     unchanged\nModel steps  zero reported cost';
    }
    return scene;
  });
}

export function uiStoryboard(source: any): WorkflowScene[] {
  assert.equal(source.prompt, uiDemoPrompt);
  for (const assertion of ['Passed filter displayed Portal only', 'All restored three rows', 'UI Kill terminated sandbox and route']) assert.ok(source.assertions.includes(assertion));
  return uiDemoSteps.map((step) => {
    const scene = base(step);
    if (step.id === 'boundary') {
      scene.kind = 'overview'; scene.label = 'THE DASHBOARD / NO LOCAL TOOLCHAIN';
      scene.steps = [
        { title: 'Your browser', detail: 'Create a workspace. Use Terminal, Filesystem and Network. Check results before cleanup.' },
        { title: 'Harakiri sandbox', detail: 'OpenCode generates server.mjs and index.html. Node serves the app on port 3000.' },
        { title: 'External model', detail: 'Only the explicit free model is configured. The provider receives synthetic task context.' },
      ];
    } else if (['use-case', 'create', 'tools', 'files', 'preview', 'cleanup'].includes(step.id)) {
      const name = ({ 'use-case': 'preview', create: 'create', tools: 'agent-tools', files: 'files', preview: 'preview', cleanup: 'terminated' } as Record<string, string>)[step.id]!;
      const clip = source.clips.find((item: any) => item.name === name); assert.ok(clip);
      Object.assign(scene, { kind: 'footage', label: 'REAL DASHBOARD CAPTURE', content: '', video: clip.video, image: `${name}.png`, footageSeconds: clip.durationMs / 1000 });
    } else if (step.id.startsWith('prompt-')) {
      scene.label = `ui-prompt.txt / COMPLETE PROMPT / PART ${step.id === 'prompt-app' ? 1 : 2} OF 2`;
    } else if (step.id === 'command') {
      scene.label = 'DASHBOARD TERMINAL / COMPLETE COPYABLE COMMAND';
      scene.content = step.code; scene.fontSize = 28;
    } else if (step.id === 'expose') {
      scene.kind = 'result'; scene.label = 'NETWORK / VERIFIED PUBLIC PREVIEW'; scene.fontSize = 39;
      scene.content = 'Port       3000\nProtocol   HTTP\nAccess     Public\nHealth     200 / {"ok":true}\n\nOnly the app port is exposed.';
    }
    return scene;
  });
}

import assert from 'node:assert/strict';
import type { WorkflowScene } from '../src/data/workflow-schema.js';
import { sdkDemoPrompt, sdkDemoSteps } from '../../web/src/sdk-demo-walkthrough.js';

type SdkEvidence = {
  prompt: string; agentCommand: string; model: string; inputUnchanged: boolean;
  report: unknown; summary: string;
  agent: { tools: { tool: string; status: string; input?: Record<string, unknown> }[] };
};

const captions: Record<string, string> = {
  'use-case': 'A daily order export becomes a checked JSON report and a written summary. The agent must create and execute the analysis.',
  boundary: 'Your worker coordinates through Harakiri. OpenCode and Python run in the sandbox; model inference is external.',
  input: 'Paid revenue: 2500 + 19900 + 7200 = 29600 cents. Exclude the refunded order. Keep the input unchanged.',
  setup: 'Install the SDK on your worker. Set the Harakiri API URL and key privately. The sandbox template already contains OpenCode.',
  create: 'Keep the returned sandbox ID. Wait until running. The 600-second TTL is a fallback; cleanup still runs in finally.',
  upload: 'Upload data, not a prewritten analysis. /workspace is the remote sandbox directory. Retain the local input for verification.',
  model: 'Pin both main and small models to the free model. Broad tool permissions apply only to this synthetic, disposable demo.',
  prompt: 'The complete prompt specifies input, program, output schema, execution and an unchanged CSV. No hidden instructions.',
  command: 'run: non-interactive task. --format json: execution events. --model: explicit model. shellQuote keeps the prompt one argument.',
  start: 'agentCommand runs in /workspace. detached returns a job ID. timeoutMs limits command execution to four minutes.',
  wait: '260 seconds is the caller waiting budget, not a longer execution limit. Read logs before cleanup. Exit 0 alone is not acceptance.',
  tools: 'These are completed tools from the real run. The script checks zero reported model cost; private reasoning is not published.',
  download: 'Download JSON, summary and original input before termination. contentBase64 is the file envelope, not the agent answer.',
  verify: 'Assert exact totals and unchanged input before saving. The summary must be nonempty; its prose needs separate review.',
  result: 'Verified JSON and summary are saved in your worker. This recording passed; future agent runs must pass the same checks.',
  cleanup: 'finally handles success and failure. Verify terminated. If connectivity prevents cleanup, recover using the sandbox ID and TTL.',
};

export function sdkStoryboard(source: SdkEvidence): WorkflowScene[] {
  assert.equal(source.prompt, sdkDemoPrompt, 'The film must show the full recorded prompt');
  const quoted = "'" + source.prompt.replaceAll("'", "'\\''") + "'";
  assert.equal(source.agentCommand, `opencode run --format json --model ${source.model} ${quoted}`);
  assert.equal(source.inputUnchanged, true);
  assert.deepEqual(source.report, { paid_orders: 3, revenue_cents: 29600, refunded_orders: 1 });
  assert.ok(source.summary.trim());
  assert.ok(source.agent.tools.length && source.agent.tools.every((tool) => tool.status === 'completed'));
  return sdkDemoSteps.map((step) => {
    assert.ok(captions[step.id], `Missing concise video caption for ${step.id}`);
    const scene: WorkflowScene = {
      title: step.title, seconds: step.seconds, caption: captions[step.id]!,
      kind: 'code', label: 'sdk-report.mjs / SOURCE EXCERPT', content: step.code, fontSize: 31,
    };
    if (step.id === 'use-case' || step.id === 'boundary') {
      scene.kind = 'overview'; scene.label = step.id === 'use-case' ? 'THE TASK / SYNTHETIC ORDER RECONCILIATION' : 'THE EXECUTION BOUNDARY / SDK IS THE COORDINATOR';
      scene.steps = step.id === 'use-case' ? [
        { title: 'Order export', detail: 'Four synthetic orders. Count paid orders, total paid revenue, and count refunds.' },
        { title: 'Agent-written analysis', detail: 'OpenCode creates analyze.py and runs it with Python inside a disposable sandbox.' },
        { title: 'Checked deliverables', detail: 'Your worker downloads report.json and summary.md, asserts the totals, then cleans up.' },
      ] : [
        { title: 'Your Node.js worker', detail: 'Holds the Harakiri API key. Creates the sandbox, uploads data, tracks the job, verifies files.' },
        { title: 'Harakiri sandbox', detail: 'Hosts OpenCode and its tools. The agent reads orders.csv, writes code, and executes Python.' },
        { title: 'External free model', detail: 'OpenCode calls the selected provider. Inference is not local. Only synthetic data is used.' },
      ];
    } else if (step.id === 'input') {
      scene.label = 'orders.csv / COMPLETE INPUT';
    } else if (step.id === 'setup') {
      scene.label = 'YOUR NODE.JS WORKER / SHELL';
    } else if (step.id === 'tools') {
      scene.kind = 'tools'; scene.label = 'RECORDED COMPLETED TOOLS / COMMAND EXCERPTS';
      scene.content = source.agent.tools.map((tool) => {
        const detail = String(tool.input?.filePath ?? tool.input?.command ?? '').split('\n')[0]!;
        return `${tool.tool.padEnd(8)} ${detail.length > 78 ? detail.slice(0, 75) + '...' : detail}`;
      }).join('\n');
    } else if (step.id === 'result') {
      scene.kind = 'result'; scene.label = 'report.json / DOWNLOADED AND INDEPENDENTLY ASSERTED';
      scene.content = JSON.stringify(source.report, null, 2); scene.fontSize = 43;
    }
    return scene;
  });
}

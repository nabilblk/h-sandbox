import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sdkCommandCode, sdkDemoPrompt, sdkDemoSteps, sdkPromptCode } from '../../web/src/sdk-demo-walkthrough.js';
import { demos } from '../../web/src/demo-catalog.js';
import { sdkStoryboard } from './sdk-storyboard.js';
import { workflowSchema } from '../src/data/workflow-schema.js';

const source = readFileSync(new URL('../../../examples/demo/agent-workflows/sdk-report.mjs', import.meta.url), 'utf8');
function declaration(name: string) {
  const file = ts.createSourceFile('sdk-report.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => item.name.getText(file) === name)) return statement.getText(file);
  }
  throw new Error(`Missing ${name} in the runnable SDK example`);
}
const model = 'opencode/mimo-v2.5-free';
const command = (prompt: string, code = sdkCommandCode) => runInNewContext(`${code}; agentCommand`, { model, prompt }) as string;
test('video and tutorial define the exact full prompt and command used by the runnable example', () => {
  assert.equal(runInNewContext(`${declaration('prompt')}; prompt`), sdkDemoPrompt);
  assert.equal(runInNewContext(`${sdkPromptCode}; prompt`), sdkDemoPrompt);
  assert.equal(command(sdkDemoPrompt), command(sdkDemoPrompt, `${declaration('shellQuote')}\n${declaration('agentCommand')}`));
  assert.match(source, /command: agentCommand/);
});
test('the displayed shell quoting preserves prompt arguments and prevents shell evaluation', () => {
  for (const prompt of [sdkDemoPrompt, "Review O'Reilly; $(printf injected) `printf injected` $HOME \"quoted\"\nnext line"]) {
    const output = execFileSync('/bin/sh', ['-c', `set -- ${command(prompt)}; printf '%s\\0' "$@"`], { encoding: 'utf8' });
    assert.deepEqual(output.split('\0').slice(0, -1), ['opencode', 'run', '--format', 'json', '--model', model, prompt]);
  }
});
const evidence = {
  prompt: sdkDemoPrompt, agentCommand: command(sdkDemoPrompt), model, inputUnchanged: true,
  report: { paid_orders: 3, revenue_cents: 29600, refunded_orders: 1 }, summary: 'Synthetic report',
  agent: { tools: [{ tool: 'bash', status: 'completed', input: { command: 'python analyze.py' } }] },
};
test('SDK chapters share a consistent, deliberately slower narrative across video and player', () => {
  const scenes = sdkStoryboard(evidence);
  const catalog = demos.find((demo) => demo.id === 'sdk-agent-report')!;
  assert.equal(scenes.length, 16);
  assert.equal(catalog.seconds, 298);
  assert.equal(scenes.reduce((sum, scene) => sum + scene.seconds, 0), catalog.seconds);
  assert.ok(scenes.findIndex((scene) => scene.content.includes('const agentCommand')) < scenes.findIndex((scene) => scene.content.includes('command: agentCommand')));
  for (const [index, scene] of scenes.entries()) {
    assert.ok(workflowSchema.shape.scenes.element.safeParse(scene).success);
    assert.ok(scene.caption.length < 180);
    assert.equal(catalog.chapters[index]!.start, scenes.slice(0, index).reduce((sum, item) => sum + item.seconds, 0));
    assert.equal(scene.title, sdkDemoSteps[index]!.title);
  }
});
test('storyboard rejects evidence with hidden instructions, modified input or wrong output', () => {
  for (const change of [{ prompt: 'another prompt' }, { agentCommand: 'echo success' }, { inputUnchanged: false }, { report: { ...evidence.report, revenue_cents: 36600 } }, { summary: '' }, { agent: { tools: [] } }]) {
    assert.throws(() => sdkStoryboard({ ...evidence, ...change }));
  }
});

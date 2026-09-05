import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { cliDemoPrompt, cliDemoSteps } from '../../web/src/cli-demo-walkthrough.js';
import { uiDemoPrompt, uiDemoSteps } from '../../web/src/ui-demo-walkthrough.js';
import { browserDemoSteps, browserPromptLines } from '../../web/src/browser-demo-walkthrough.js';
import { demos } from '../../web/src/demo-catalog.js';
import { workflowSchema } from '../src/data/workflow-schema.js';
import { cliStoryboard, uiStoryboard } from './cli-ui-storyboard.js';
import { browserStoryboard } from './browser-storyboard.js';

const fixture = (name: string) => readFileSync(new URL(`../../../examples/demo/agent-workflows/${name}`, import.meta.url), 'utf8');
const model = 'opencode/mimo-v2.5-free';
const tools = [{ tool: 'bash', status: 'completed', input: { command: 'node qa.mjs' } }];
const cli = {
  prompt: cliDemoPrompt, before: { exitCode: 1 }, after: { exitCode: 0 }, initialHash: 'same', finalHash: 'same', diff: 'invoice.mjs',
  events: [{ name: 'agent-start', command: cliDemoPrompt }, ...['tests-before', 'tests-after'].map((name) => ({ name, stdout: '# tests 4\n# pass 4' }))],
  agent: { tools },
};
const ui = {
  prompt: uiDemoPrompt, assertions: ['Passed filter displayed Portal only', 'All restored three rows', 'UI Kill terminated sandbox and route'],
  clips: ['preview', 'create', 'agent-tools', 'files', 'terminated'].map((name) => ({ name, video: `${name}.mp4`, durationMs: 6000 })),
};
const browser = {
  prompt: browserPromptLines.join('\n'), model,
  agentCommand: `opencode run --format json --model ${model} '${browserPromptLines.join('\n')}'`,
  inputUnchanged: true, testUnchanged: true, report: { initialRows: 3, passedNames: ['Portal'], restoredRows: 3, mobileOverflow: false },
  mutationExitCode: 1, mutationOutput: 'AssertionError [ERR_ASSERTION]', setupSeconds: 130, agent: { tools },
  testSource: "await page.selectOption('#status', 'passed');\nconst passedNames = await page.locator('td').allTextContents();\nassert.deepEqual(passedNames, ['Portal']);",
};
test('CLI, UI and browser prompts match complete downloadable source, without hidden task placeholders', () => {
  assert.equal(fixture('cli-prompt.txt').trim(), cliDemoPrompt);
  assert.equal(fixture('ui-prompt.txt').trim(), uiDemoPrompt);
  assert.equal(fixture('browser-prompt.txt').trim(), browserPromptLines.join('\n'));
  assert.ok(uiDemoSteps.find((step) => step.id === 'command')!.code.includes(uiDemoPrompt));
  assert.ok(cliDemoSteps.findIndex((step) => step.id === 'prompt') < cliDemoSteps.findIndex((step) => step.id === 'start'));
});
test('expanded films and chapters have one timeline, readable scene contracts and short captions', () => {
  for (const [id, scenes, steps] of [
    ['cli-agent-repair', cliStoryboard(cli), cliDemoSteps],
    ['ui-agent-app', uiStoryboard(ui), uiDemoSteps],
    ['browser-agent-qa', browserStoryboard(browser), browserDemoSteps],
  ] as const) {
    const catalog = demos.find((demo) => demo.id === id)!;
    assert.ok(catalog.seconds > 240);
    let start = 0;
    for (const [index, scene] of scenes.entries()) {
      workflowSchema.shape.scenes.element.parse(scene);
      assert.equal(scene.title, steps[index]!.title);
      assert.ok(scene.caption.length <= 180, scene.caption);
      assert.equal(catalog.chapters[index]!.start, start);
      start += scene.seconds;
    }
    assert.equal(start, catalog.seconds);
  }
});
test('publication rejects changed prompts, changed input, missed regressions and infrastructure failures', () => {
  assert.throws(() => cliStoryboard({ ...cli, prompt: 'secret task' }));
  assert.throws(() => cliStoryboard({ ...cli, finalHash: 'modified tests' }));
  assert.throws(() => uiStoryboard({ ...ui, assertions: [] }));
  for (const change of [{ prompt: 'hidden prompt' }, { inputUnchanged: false }, { testUnchanged: false }, { mutationExitCode: 0 }, { mutationOutput: 'Browser cannot start' }, { report: { ...browser.report, restoredRows: 1 } }]) {
    assert.throws(() => browserStoryboard({ ...browser, ...change }));
  }
});
test('browser film command quotes exactly like the runnable worker, including shell metacharacters', () => {
  const snippet = browserDemoSteps.find((step) => step.id === 'agent')!.code;
  const declarations = (source: string) => {
    const file = ts.createSourceFile('example.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    return file.statements.filter((statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => ['shellQuote', 'agentCommand'].includes(item.name.getText(file)))).map((statement) => statement.getText(file)).join('\n');
  };
  for (const prompt of [browser.prompt, "O'Reilly; $(printf injected) `printf injected` $HOME\nnext"]) {
    const shown = runInNewContext(`${declarations(snippet)}; agentCommand`, { model, prompt });
    const actual = runInNewContext(`${declarations(fixture('browser-qa.mjs'))}; agentCommand`, { model, prompt });
    assert.equal(shown, actual);
    const args = execFileSync('/bin/sh', ['-c', `set -- ${shown}; printf '%s\\0' "$@"`], { encoding: 'utf8' }).split('\0').slice(0, -1);
    assert.deepEqual(args, ['opencode', 'run', '--format', 'json', '--model', model, prompt]);
  }
});

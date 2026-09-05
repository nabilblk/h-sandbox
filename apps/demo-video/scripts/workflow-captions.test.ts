import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workflowCaptions } from './workflow-captions.js';
test('captions retain all text in short nonoverlapping cues without duplicating the title', () => {
  const caption = 'run: non-interactive task. --format json: execution events. --model: explicit model. shellQuote keeps the prompt one argument.';
  const vtt = workflowCaptions([{ start: 142, end: 164, caption }]);
  const cues = vtt.trim().split('\n\n').slice(1).map((block) => block.split('\n'));
  assert.equal(cues.map((cue) => cue[1]).join(' '), caption);
  assert.ok(cues.every((cue) => cue[1]!.length <= 72));
  assert.match(cues[0]![0]!, /^00:02:22\.000 --> /);
  assert.match(cues.at(-1)![0]!, / --> 00:02:44\.000 /);
  for (let i = 1; i < cues.length; i++) assert.equal(cues[i]![0]!.split(' ')[0], cues[i - 1]![0]!.split(' ')[2]);
});

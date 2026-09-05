import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentEvidence, verifyRepair } from './agent-evidence.js';
const trace = (cost: number) => JSON.stringify({ type: 'step_finish', part: { cost } }) + '\n' + JSON.stringify({ type: 'tool_use', part: { tool: 'bash', state: { status: 'completed' } } });
test('agent evidence requires completed tools and zero-cost steps', () => {
  assert.deepEqual(agentEvidence(trace(0)).costs, [0]);
  assert.throws(() => agentEvidence(trace(1)));
  assert.throws(() => agentEvidence(''));
  assert.throws(() => agentEvidence(trace(0).replace('completed', 'error')));
  assert.throws(() => agentEvidence(trace(0) + '\n{"type":"error"}'));
});
test('repair verification rejects fabricated success and modified tests', () => {
  verifyRepair({ exitCode: 1 }, { exitCode: 0 }, 'hash', 'hash', 'diff invoice.mjs');
  assert.throws(() => verifyRepair({ exitCode: 0 }, { exitCode: 0 }, 'hash', 'hash', 'diff invoice.mjs'));
  assert.throws(() => verifyRepair({ exitCode: 1 }, { exitCode: 1 }, 'hash', 'hash', 'diff invoice.mjs'));
  assert.throws(() => verifyRepair({ exitCode: 1 }, { exitCode: 0 }, 'hash', 'changed', 'diff invoice.mjs'));
});

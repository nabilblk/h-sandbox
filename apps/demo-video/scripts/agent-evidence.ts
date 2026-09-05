import assert from 'node:assert/strict';

export function agentEvidence(stdout: string) {
  const events = stdout.split('\n').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  assert.ok(!events.some((event) => event.type === 'error'), 'Agent returned an error');
  const steps = events.filter((event) => event.type === 'step_finish');
  assert.ok(steps.length > 0, 'No completed agent steps');
  assert.ok(steps.every((event) => event.part?.cost === 0), 'Only zero-cost model executions may be published');
  const tools = events.filter((event) => event.type === 'tool_use').map((event) => ({ tool: String(event.part.tool), status: String(event.part.state?.status), input: event.part.state?.input, output: event.part.state?.output }));
  assert.ok(tools.length > 0 && tools.every((tool) => tool.status === 'completed'), 'Agent tools must complete');
  return { tools, costs: steps.map(() => 0) };
}

export function verifyRepair(before: { exitCode: number }, after: { exitCode: number }, initialHash: string, finalHash: string, diff: string) {
  assert.notEqual(before.exitCode, 0, 'Baseline must fail');
  assert.equal(after.exitCode, 0, 'Repaired implementation must pass');
  assert.equal(finalHash, initialHash, 'Agent modified the acceptance tests');
  assert.match(diff, /invoice\.mjs/, 'Implementation must actually change');
}

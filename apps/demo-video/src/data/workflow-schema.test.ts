import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { workflowSchema } from './workflow-schema.js';
const source = JSON.parse(readFileSync(new URL('../../public/workflows/cli-agent-repair/workflow.json', import.meta.url), 'utf8'));
test('workflow contract rejects incomplete cleanup, paid execution and missing footage', () => {
  assert.ok(workflowSchema.safeParse(source).success);
  assert.ok(!workflowSchema.safeParse({ ...source, cleanup: false }).success);
  assert.ok(!workflowSchema.safeParse({ ...source, costs: [0.01] }).success);
  assert.ok(!workflowSchema.safeParse({ ...source, model: 'provider/paid' }).success);
  assert.ok(!workflowSchema.safeParse({ ...source, scenes: source.scenes.map((scene: any) => ({ ...scene, kind: 'footage' })) }).success);
});

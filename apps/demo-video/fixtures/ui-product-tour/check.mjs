import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const checks = [
  { name: 'Node runtime', check: () => assert.equal(Number(process.versions.node.split('.')[0]), 20) },
  { name: 'Persistent working directory', check: () => assert.equal(process.cwd(), '/workspace') },
  { name: 'Release calculation', check: () => assert.equal([12, 18, 24].reduce((sum, n) => sum + n, 0), 54) },
];
const results = [];
for (const { name, check } of checks) {
  await setTimeout(1100);
  check();
  results.push({ name, passed: true });
  console.log(`PASS  ${name}`);
}
await writeFile('report.json', JSON.stringify({ project: 'release-checks', results }, null, 2) + '\n');
console.log('3 checks passed. Saved report.json.');

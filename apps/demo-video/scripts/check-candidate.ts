import { resolve, join } from 'node:path';
import { verifyCapture } from './verify-capture.js';
import { writeJson } from './io.js';

const input = process.argv[2];
if (!input) throw new Error('Provide a candidate capture directory');
const directory = resolve(input);
const capture = await verifyCapture(directory);
await writeJson(join(directory, 'verification.json'), {
  schemaVersion: 1, runId: capture.runId, checkedAt: new Date().toISOString(),
  hashes: 'passed', metadata: 'passed', text: 'passed', sampledOcr: 'passed',
  publicationApproved: false,
});
console.log('Candidate scan passed. Visual review and explicit approval are still required.');

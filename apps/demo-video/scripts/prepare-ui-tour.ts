import assert from 'node:assert/strict';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileHash, json, root, workspace, writeJson } from './io.js';
import { uiTourSchema } from '../src/data/ui-tour-schema.js';
import { assertSanitized } from './sanitize.js';

assert.ok(process.argv.includes('--reviewed'), 'Review the full private recording and privacy evidence before passing --reviewed');
const { directory } = await json(join(root, 'docs/artifacts/demo/ui-product-tour/latest.json'));
const tour = uiTourSchema.parse(await json(join(directory, 'tour.json')));
assertSanitized(JSON.stringify(tour), [tour.appOrigin, tour.apiOrigin, tour.previewOrigin]);
const target = join(workspace, 'public/ui-product-tour');
await mkdir(target, { recursive: true });
for (const clip of tour.clips) {
  assert.equal(await fileHash(join(directory, clip.file)), clip.sha256);
  await copyFile(join(directory, clip.file), join(target, clip.file));
}
await writeJson(join(target, 'tour.json'), tour);
await writeJson(join(root, 'docs/artifacts/demo/ui-product-tour/review.json'), { reviewedAt: new Date().toISOString(), manifestSha256: await fileHash(join(target, 'tour.json')), directory });
console.log('Prepared only the reviewed tour manifest and full-frame source clips. No private identity, diagnostics or raw frames copied.');

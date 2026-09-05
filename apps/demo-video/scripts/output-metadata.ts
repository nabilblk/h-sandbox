import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Capture } from '../src/data/capture-schema.js';
import { chapters, transcript, vtt } from '../src/data/storyboard.js';
import { tutorialHtml } from './tutorial.js';

export const outputFiles = [
  'harakiri-product-demo.mp4', 'harakiri-hero-loop.mp4',
  'harakiri-product-demo.webp', 'harakiri-hero-loop.webp',
  'harakiri-product-demo.vtt', 'transcript.md', 'provenance.json', 'tutorial.html',
] as const;

export const provenance = (capture: Capture) => ({
  source: 'live', capturedAt: capture.capturedAt, runId: capture.runId,
  release: capture.release, cliVersion: capture.cliVersion,
  template: capture.sandbox.template, templateVersion: capture.sandbox.version,
  review: capture.review, chapters: chapters.map(({ start, title }) => ({ start, title })),
  note: 'Waiting time is edited. Metrics are snapshots, not benchmarks. The captured sandbox and route were cleaned up.',
});

export async function verifyOutputMetadata(directory: string, capture: Capture) {
  assert.deepEqual((await readdir(directory)).sort(), [...outputFiles].sort(), 'Website demo contains missing or unexpected files');
  for (const file of outputFiles) {
    const info = await lstat(join(directory, file));
    assert.ok(info.isFile(), `${file} must be a regular file, not a symlink`);
    assert.ok(info.mode & 0o004, `${file} is unreadable by the web server`);
  }
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8')), provenance(capture), 'Website provenance differs from the reviewed capture');
  assert.equal(await readFile(join(directory, 'harakiri-product-demo.vtt'), 'utf8'), vtt(), 'Captions differ from the storyboard');
  assert.equal(await readFile(join(directory, 'transcript.md'), 'utf8'), transcript(), 'Transcript differs from the storyboard');
  assert.equal(await readFile(join(directory, 'tutorial.html'), 'utf8'), tutorialHtml(), 'Static tutorial differs from public documentation');
}

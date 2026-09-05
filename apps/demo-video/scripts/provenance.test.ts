import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspace, json } from './io.js';
import { reviewDigest, verifyCapture } from './verify-capture.js';

test('review digest changes when captured evidence changes', async () => {
  const capture = await json(join(workspace, 'public/capture/capture.json'));
  const original = reviewDigest(capture);
  capture.route.url = 'https://changed.example';
  assert.notEqual(reviewDigest(capture), original);
});
test('missing source media fails verification instead of rendering a placeholder', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'demo-missing-media-'));
  try {
    await copyFile(join(workspace, 'public/capture/capture.json'), join(temp, 'capture.json'));
    await assert.rejects(verifyCapture(temp, false), /ENOENT/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

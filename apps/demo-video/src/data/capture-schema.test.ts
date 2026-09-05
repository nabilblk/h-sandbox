import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSchema, checkpointNames, requirePublishable } from './capture-schema.js';
import { chapters, fullDuration, vtt } from './storyboard.js';

const fixture = () => ({
  schemaVersion: 1, source: 'live', status: 'captured', publishable: false,
  runId: 'product-demo-test', capturedAt: '2026-09-05T00:00:00.000Z', cliVersion: '0.4.0', release: '0.4.0', sourceRevision: 'a'.repeat(40), publicOrigins: ['https://web.example', 'https://api.example'],
  releaseEvidence: { apiSpecSha256: 'a'.repeat(64), webAssetSha256: 'a'.repeat(64) },
  sandbox: { id: 'sbx_test', template: 'test-only', version: 'tplv_test', status: 'terminated', ttl: 300 },
  route: { url: 'https://web.example/preview', port: 3000, readyStatus: 200, runMatched: true },
  events: ['version', 'login', 'create', 'upload-server', 'start', 'expose', 'routes', 'kill'].map((name, index) => ({ name, command: name, startedMs: index, durationMs: 1, exitCode: 0, stdout: 'test fixture only', stderr: '' })),
  terminal: { command: 'attach', stdout: '/workspace\nserver.mjs\nindex.html', chunks: [{ atMs: 0, text: '/workspace\nserver.mjs\nindex.html' }], exitCode: 0 },
  checkpoints: checkpointNames.map((name) => ({ name, sandboxId: 'sbx_test', assertion: 'test-only', atMs: 0, image: `${name}.png`, imageSha256: 'a'.repeat(64), video: `${name}.mp4`, videoSha256: 'a'.repeat(64), durationMs: 3200, recording: { source: 'cdp-screencast', frameCount: 1, startedAt: '2026-09-05T00:00:00.000Z', endedAt: '2026-09-05T00:00:03.200Z' }, crop: { x: 0, y: 0, width: 1440, height: 900 } })),
  cleanup: { status: 'complete', sandboxTerminal: true, routeInactive: true, containerRemoved: true, completedAt: '2026-09-05T00:00:00.000Z' }, review: null,
});
test('a candidate cannot be rendered for publication', () => {
  assert.ok(captureSchema.safeParse(fixture()).success);
  assert.throws(() => requirePublishable(fixture()));
});
test('rejects unknown fields, missing evidence, incompatible schema and failed cleanup', () => {
  for (const value of [{ ...fixture(), token: 'secret' }, { ...fixture(), schemaVersion: 2 }, { ...fixture(), cleanup: undefined }, { ...fixture(), route: { ...fixture().route, readyStatus: 502 } }, { ...fixture(), checkpoints: [] }, { ...fixture(), publishable: true }]) assert.ok(!captureSchema.safeParse(value).success);
  assert.ok(!captureSchema.safeParse({ ...fixture(), checkpoints: fixture().checkpoints.map((point) => ({ ...point, recording: undefined })) }).success);
});
test('all scenes and captions cover the timeline without gaps', () => {
  assert.equal(chapters[0].start, 0);
  assert.equal(chapters.at(-1)!.end, fullDuration);
  chapters.slice(1).forEach((chapter, index) => assert.equal(chapter.start, chapters[index].end));
  assert.equal((vtt().match(/-->/g) ?? []).length, chapters.length);
});

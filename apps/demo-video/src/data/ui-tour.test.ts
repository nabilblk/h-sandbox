import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { uiTourSchema } from './ui-tour-schema.js';
import { uiProductTourChapters, uiProductTourSteps, uiProductTourSeconds } from '../../../web/src/ui-product-tour.js';
import { workflowCaptions } from '../../scripts/workflow-captions.js';

function fixture() {
  const hash = 'a'.repeat(64);
  return {
    schemaVersion: 1, id: 'ui-product-tour', capturedAt: '2026-09-09T12:00:00.000Z', sourceRevision: 'b'.repeat(40), sourceFiles: { 'app.tsx': hash },
    appOrigin: 'https://sb.harakiri.io', frontend: 'local-source-preview-against-live-api', apiOrigin: 'https://sb-api.harakiri.io', previewOrigin: 'https://example.harakiri.io',
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, browserZoom: 1 }, fixtureHashes: { 'check.mjs': hash }, reportSha256: hash, replacementVerified: true,
    cleanup: { runtimesTerminated: 2, routesInactive: true, workspace: 'archived-files-retained', captureKeyRevoked: true },
    networkProof: { baselineReachable: true, allowedReachable: true, unlistedDenied: true },
    clips: uiProductTourSteps.map(step => ({ id: step.id, file: step.id + '.mp4', sha256: hash, seconds: Number(step.seconds), width: 1920, height: 1080, crop: 'none', speed: 1, pointer: [{ at: 1, x: 200, y: 300, click: true }], recording: { source: 'cdp-screencast', frameCount: 100, startedAt: '2026-09-09T12:00:00.000Z', endedAt: new Date(Date.parse('2026-09-09T12:00:00.000Z') + step.seconds * 1000).toISOString() } })),
  };
}
test('only complete, uncropped, normal-speed real UI captures are accepted', () => {
  assert.ok(uiTourSchema.safeParse(fixture()).success);
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.viewport.browserZoom = 1.25; },
    (f: ReturnType<typeof fixture>) => { f.clips[0]!.width = 1600; },
    (f: ReturnType<typeof fixture>) => { f.clips[0]!.crop = 'panel'; },
    (f: ReturnType<typeof fixture>) => { f.clips[0]!.speed = 2; },
    (f: ReturnType<typeof fixture>) => { f.clips[0]!.seconds = 5; },
    (f: ReturnType<typeof fixture>) => { f.clips.reverse(); },
    (f: ReturnType<typeof fixture>) => { f.clips[0]!.pointer[0]!.at = 100; },
    (f: ReturnType<typeof fixture>) => { f.cleanup.captureKeyRevoked = false; },
    (f: ReturnType<typeof fixture>) => { f.replacementVerified = false; },
  ]) { const capture = fixture(); mutation(capture); assert.equal(uiTourSchema.safeParse(capture).success, false); }
});
test('guide and captions cover the film continuously without crossing chapters', () => {
  assert.equal(uiProductTourChapters[0]!.start, 0);
  assert.equal(uiProductTourChapters.at(-1)!.end, uiProductTourSeconds);
  uiProductTourChapters.forEach((chapter, i) => { if (i) assert.equal(chapter.start, uiProductTourChapters[i - 1]!.end); assert.ok(chapter.guide.length > 100); });
  const vtt = workflowCaptions(uiProductTourChapters.map(c => ({ ...c, caption: c.guide })));
  assert.match(vtt, /^WEBVTT/);
  assert.doesNotMatch(vtt, /NaN|undefined/);
});
test('composition displays source UI edge-to-edge without a presentation frame', () => {
  const source = readFileSync(new URL('../compositions/UiProductTour.tsx', import.meta.url), 'utf8');
  assert.match(source, /objectFit: 'contain'/);
  assert.doesNotMatch(source, /cropLeft|cropRight|cropTop|cropBottom|scale\(|translate\(|playbackRate|<h1|<h2|<p[ >]/);
});

import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { exec, fileHash, json, root, workspace, writeJson } from './io.js';
import { uiTourSchema } from '../src/data/ui-tour-schema.js';
import { uiProductTourChapters, uiProductTourSeconds } from '../../web/src/ui-product-tour.js';
import { workflowCaptions } from './workflow-captions.js';
import { assertSanitized } from './sanitize.js';
import { scanImage } from './verify-capture.js';
import { tourTutorialHtml } from './tour-tutorial.js';

const target = join(root, 'apps/web/public/demos/ui-product-tour');
const source = join(workspace, 'public/ui-product-tour');
const evidence = join(root, 'docs/artifacts/demo/ui-product-tour/verification');
await mkdir(evidence, { recursive: true, mode: 0o700 });
const provenance = await json(join(target, 'provenance.json'));
const tour = uiTourSchema.parse(provenance);
assert.deepEqual(tour, uiTourSchema.parse(await json(join(source, 'tour.json'))));
assert.equal(provenance.seconds, uiProductTourSeconds);
const allowed = ['video.mp4', 'poster.webp', 'captions.vtt', 'transcript.md', 'example-source.zip', 'tutorial.html', 'provenance.json'];
assert.deepEqual((await readdir(target)).sort(), allowed.sort());
for (const [name, asset] of Object.entries(provenance.files) as [string, { sha256: string; bytes: number }][]) {
  assert.ok(allowed.includes(name));
  assert.equal(await fileHash(join(target, name)), asset.sha256);
  assert.equal((await readFile(join(target, name))).length, asset.bytes);
}
assert.equal(await readFile(join(target, 'captions.vtt'), 'utf8'), workflowCaptions(uiProductTourChapters.map(c => ({ ...c, caption: c.guide }))));
assert.equal(await readFile(join(target, 'tutorial.html'), 'utf8'), tourTutorialHtml());
const probe = async (file: string, seconds: number) => {
  const data = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
  assert.equal(data.streams.length, 1);
  const stream = data.streams[0];
  assert.equal(stream.codec_type, 'video'); assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, 1920); assert.equal(stream.height, 1080);
  assert.equal(stream.r_frame_rate, '30/1');
  assert.ok(Math.abs(Number(data.format.duration) - seconds) <= 0.1);
};
await probe(join(target, 'video.mp4'), uiProductTourSeconds);
const origins = [tour.appOrigin, tour.apiOrigin, tour.previewOrigin, 'https://registry.npmjs.org', 'https://example.com'];
assertSanitized(JSON.stringify(provenance), origins);
assertSanitized(await readFile(join(target, 'captions.vtt'), 'utf8'), origins);
const scanned: string[] = [];
await scanImage(join(target, 'poster.webp'), origins);
for (const [index, clip] of tour.clips.entries()) {
  assert.equal(await fileHash(join(source, clip.file)), clip.sha256);
  await probe(join(source, clip.file), clip.seconds);
  const chapter = uiProductTourChapters[index]!;
  // Inspect both sides of every edit and the action/result within each scene.
  for (const offset of [0.1, clip.seconds / 2, clip.seconds - 0.1]) {
    const file = join(evidence, `${clip.id}-${offset.toFixed(1)}.png`);
    await exec('ffmpeg', ['-v', 'error', '-y', '-ss', String(chapter.start + offset), '-i', join(target, 'video.mp4'), '-frames:v', '1', file]);
    const size = await sharp(file).metadata();
    assert.equal(size.width, 1920); assert.equal(size.height, 1080);
    // A preview may use a short-lived public URL, but the browser chrome is not recorded.
    await scanImage(file, origins);
    scanned.push(file.split('/').at(-1)!);
  }
  console.log(`Verified chapter: ${clip.id}`);
}
const entries = (await exec('unzip', ['-Z1', join(target, 'example-source.zip')])).stdout.trim().split('\n');
assert.deepEqual(entries.sort(), Object.keys(tour.fixtureHashes).sort());
for (const file of entries) {
  const bytes = (await exec('unzip', ['-p', join(target, 'example-source.zip'), file])).stdout;
  assert.equal(bytes, await readFile(join(workspace, 'fixtures/ui-product-tour', file), 'utf8'));
}
await writeJson(join(evidence, 'result.json'), { verifiedAt: new Date().toISOString(), seconds: uiProductTourSeconds, chapters: tour.clips.length, framesScanned: scanned.length, hashesMatch: true, fullViewport: true, scanned });
console.log('Tour artifact verification passed. Browser playback and visual review are separate acceptance gates.');

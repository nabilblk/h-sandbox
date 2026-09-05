import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exec, root, workspace } from './io.js';
import { requirePublishable } from '../src/data/capture-schema.js';
import { extractBoundaryFrames, scanImage, verifyCapture } from './verify-capture.js';
import { assertSanitized } from './sanitize.js';
import { verifyOutputMetadata } from './output-metadata.js';

const capture = requirePublishable(await verifyCapture(join(workspace, 'public/capture')));
const directory = join(root, 'apps/web/public/demo');
await verifyOutputMetadata(directory, capture);
const temporary = await mkdtemp(join(tmpdir(), 'harakiri-demo-render-'));
try {
  for (const [name, seconds, budget] of [['harakiri-product-demo', 68, 10_000_000], ['harakiri-hero-loop', 14, 2_000_000]] as const) {
    const path = join(directory, `${name}.mp4`);
    assert.ok((await stat(path)).size <= budget, `${name} exceeds asset budget`);
    const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout);
    delete probe.format.filename;
    assertSanitized(JSON.stringify(probe), capture.publicOrigins);
    assert.equal(probe.streams.length, 1);
    const stream = probe.streams[0];
    assert.equal(stream.width, 1920); assert.equal(stream.height, 1080);
    assert.equal(stream.codec_name, 'h264'); assert.equal(stream.pix_fmt, 'yuv420p');
    assert.equal(stream.r_frame_rate, '30/1');
    assert.ok(Math.abs(Number(probe.format.duration) - seconds) < 0.1);
    await exec('ffmpeg', ['-v', 'error', '-i', path, '-vf', 'fps=1/2', join(temporary, `${name}-%03d.png`)]);
    await extractBoundaryFrames(path, temporary, name);
  }
  for (const frame of await readdir(temporary)) await scanImage(join(temporary, frame), capture.publicOrigins);
  for (const name of ['harakiri-product-demo', 'harakiri-hero-loop']) {
    const poster = join(directory, `${name}.webp`);
    assert.ok((await stat(poster)).size <= 250_000, `${name} poster exceeds budget`);
    await scanImage(poster, capture.publicOrigins);
  }
  for (const file of ['harakiri-product-demo.vtt', 'transcript.md', 'provenance.json']) assertSanitized(await readFile(join(directory, file), 'utf8'), capture.publicOrigins);
  const assets = await readdir(directory);
  console.log('Verified dimensions, duration, codec, budgets, nonblank frames, captions, OCR and provenance:', assets.join(', '));
} finally { await rm(temporary, { recursive: true, force: true }); }

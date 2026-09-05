import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { captureSchema, type Capture } from '../src/data/capture-schema.js';
import { assertSanitized, sanitize } from './sanitize.js';
import { exec, fileHash, json, sha256 } from './io.js';

export function reviewDigest(capture: Capture) {
  return sha256(JSON.stringify({ ...capture, status: 'captured', publishable: false, review: null }));
}
export async function extractBoundaryFrames(path: string, directory: string, name: string) {
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', path, '-frames:v', '1', join(directory, `${name}-first.png`)]);
  await exec('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', path, '-vf', 'reverse', '-frames:v', '1', join(directory, `${name}-last.png`)]);
  for (const boundary of ['first', 'last']) assert.ok((await stat(join(directory, `${name}-${boundary}.png`))).size > 0, `Missing ${boundary} video frame`);
}
export async function scanImage(path: string, origins: string[], examples: string[] = []) {
  const stats = await sharp(path).stats();
  assert.ok(stats.channels.some((channel) => channel.stdev > 8), `Blank capture frame: ${basename(path)}`);
  const metadata = await sharp(path).metadata();
  assert.ok(!metadata.exif && !metadata.xmp, 'Image includes unnecessary metadata');
  const ocr = await exec('tesseract', [path, 'stdout', '--psm', '11'], { timeout: 30_000 });
  // Normalize spacing only for explicitly reviewed sandbox fixture addresses.
  // Other OCR URLs keep the existing strict review behavior.
  const text = examples.length ? ocr.stdout.replace(/http:\s*\/\s*\/\s*(?=127\.0\.0\.1:300[01](?!\d))/g, 'http://') : ocr.stdout;
  try { assertSanitized(text, origins, examples); }
  catch (error) { throw new Error(`OCR review failed for ${basename(path)}: ${sanitize(text).slice(0, 2000)}`, { cause: error }); }
}
export async function verifyCapture(directory: string, scan = true) {
  const capture = captureSchema.parse(await json(join(directory, 'capture.json')));
  const allowedFiles = new Set(['capture.json', 'verification.json', ...capture.checkpoints.flatMap((point) => [point.image, point.video])]);
  if (capture.publishable) for (const file of await readdir(directory)) assert.ok(allowedFiles.has(file), `Unexpected public capture file: ${file}`);
  assertSanitized(JSON.stringify(capture), capture.publicOrigins);
  if (capture.review) assert.equal(capture.review.manifestSha256, reviewDigest(capture), 'Reviewed manifest was modified');
  const temporary = await mkdtemp(join(tmpdir(), 'harakiri-demo-scan-'));
  try {
    for (const point of capture.checkpoints) {
      assert.equal(await fileHash(join(directory, point.image)), point.imageSha256, `Modified image: ${point.name}`);
      assert.equal(await fileHash(join(directory, point.video)), point.videoSha256, `Modified video: ${point.name}`);
      const path = join(directory, point.video);
      const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout);
      delete probe.format.filename;
      assertSanitized(JSON.stringify(probe), capture.publicOrigins);
      assert.equal(probe.streams.length, 1, 'Capture must not include microphone audio');
      assert.equal(probe.streams[0].codec_name, 'h264');
      assert.equal(probe.streams[0].width, point.crop.width);
      assert.equal(probe.streams[0].height, point.crop.height);
      assert.ok(Math.abs(Number(probe.format.duration) * 1000 - point.durationMs) < 100);
      if (scan) {
        await scanImage(join(directory, point.image), capture.publicOrigins);
        await exec('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', 'fps=2', join(temporary, `${point.name}-%03d.png`)]);
        await extractBoundaryFrames(path, temporary, point.name);
      }
    }
    if (scan) for (const frame of await readdir(temporary)) await scanImage(join(temporary, frame), capture.publicOrigins);
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return capture;
}

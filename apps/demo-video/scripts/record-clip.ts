import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import type { Checkpoint } from '../src/data/capture-schema.js';
import { exec, writeJson } from './io.js';

type Frame = { data: Buffer; timestamp: number };

export async function recordClip(page: Page, directory: string, name: string, crop: Checkpoint['crop'], options: { duration?: number; action?: () => Promise<void> } = {}) {
  const duration = options.duration ?? 3.2;
  assert.ok(duration > 0 && duration <= 30, 'Browser clips must be bounded to 30 seconds');
  const raw = join(directory, 'raw-video', name);
  await mkdir(raw, { recursive: true, mode: 0o700 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const session = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  let resolveFirst!: () => void;
  const firstFrame = new Promise<void>((resolve) => { resolveFirst = resolve; });
  let failure: Error | undefined;
  let recording = true;
  session.on('Page.screencastFrame', (event) => {
    if (!recording) return;
    const timestamp = event.metadata.timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) failure = new Error('Screencast frame has no timestamp');
    else if (frames.length >= 1800) failure = new Error('Screencast exceeded bounded frame storage');
    else frames.push({ data: Buffer.from(event.data, 'base64'), timestamp });
    resolveFirst();
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch((error) => { if (recording) failure = error; });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await session.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 2560, maxHeight: 1800, everyNthFrame: 1 });
    await Promise.race([firstFrame, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('No browser screencast frame received')), 10_000); })]);
    clearTimeout(timer);
    const started = performance.now();
    if (options.action) await options.action();
    const remaining = duration * 1000 - (performance.now() - started);
    assert.ok(remaining >= 0, 'Recorded interaction exceeded its clip duration');
    await page.waitForTimeout(remaining);
    await session.send('Page.stopScreencast');
  } finally {
    clearTimeout(timer);
    recording = false;
    await session.detach().catch(() => undefined);
  }
  if (failure) throw failure;
  assert.ok(frames.length, 'A real browser frame is required');
  const first = frames[0]!.timestamp;
  const selected = frames.filter((frame) => frame.timestamp - first < duration);
  assert.ok(selected.every((frame, index) => index === 0 || frame.timestamp >= selected[index - 1]!.timestamp), 'Screencast timestamps moved backwards');
  const entries: string[] = ['ffconcat version 1.0'];
  const timestamps: { file: string; capturedAt: string }[] = [];
  for (const [index, frame] of selected.entries()) {
    const file = `${String(index).padStart(5, '0')}.jpg`;
    const end = selected[index + 1]?.timestamp ?? first + duration;
    await writeFile(join(raw, file), frame.data, { mode: 0o600 });
    entries.push(`file '${file}'`, `duration ${Math.max(0.001, end - frame.timestamp).toFixed(6)}`);
    timestamps.push({ file, capturedAt: new Date(frame.timestamp * 1000).toISOString() });
  }
  entries.push(`file '${timestamps.at(-1)!.file}'`);
  await writeFile(join(raw, 'frames.ffconcat'), `${entries.join('\n')}\n`, { mode: 0o600 });
  await writeJson(join(raw, 'timestamps.json'), timestamps);
  // Stop the browser recording before the caller can navigate to another tab.
  const dimensions = await sharp(selected[0]!.data).metadata();
  const scale = dimensions.width! / page.viewportSize()!.width;
  const even = (value: number) => Math.floor(value * scale / 2) * 2;
  await exec('ffmpeg', ['-v', 'error', '-y', '-safe', '1', '-i', join(raw, 'frames.ffconcat'), '-t', String(duration), '-vf', `crop=${even(crop.width)}:${even(crop.height)}:${even(crop.x)}:${even(crop.y)},fps=30`, '-an', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(directory, `${name}.mp4`)]);
  return { durationMs: duration * 1000, recording: { source: 'cdp-screencast' as const, frameCount: selected.length, startedAt: timestamps[0]!.capturedAt, endedAt: new Date((first + duration) * 1000).toISOString() } };
}

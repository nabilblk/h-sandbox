import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { recordClip } from './record-clip.js';
import { extractBoundaryFrames } from './verify-capture.js';
import { exec } from './io.js';

const directory = await mkdtemp(join(tmpdir(), 'demo-recording-check-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<h1 style="font:64px sans-serif">EXPECTED WORKSPACE</h1><p id="tick" style="font:32px sans-serif">0</p>');
  await page.evaluate(() => { let tick = 0; setInterval(() => { document.getElementById('tick')!.textContent = String(++tick); }, 200); });
  const result = await recordClip(page, directory, 'bounded', { x: 0, y: 0, width: 1440, height: 900 });
  await page.setContent('<h1>WRONG NEXT TAB</h1>');
  await extractBoundaryFrames(join(directory, 'bounded.mp4'), directory, 'bounded');
  for (const end of ['first', 'last']) {
    const text = (await exec('tesseract', [join(directory, `bounded-${end}.png`), 'stdout'])).stdout;
    assert.match(text, /EXPECTED WORKSPACE/);
    assert.doesNotMatch(text, /WRONG NEXT TAB/);
  }
  assert.equal(result.durationMs, 3200);
  assert.ok(result.recording.frameCount > 2, 'The browser must capture live changes, not just a poster');
  console.log('Browser capture records live changes and cannot include a later tab in its first/last frames.');
} finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }

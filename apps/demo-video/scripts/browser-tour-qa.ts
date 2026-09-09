import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { root, writeJson } from './io.js';
import { uiProductTourChapters, uiProductTourSeconds } from '../../web/src/ui-product-tour.js';

const base = process.argv[2] ?? 'http://127.0.0.1:19497';
const output = join(root, 'docs/artifacts/demo/ui-product-tour/browser');
await mkdir(output, { recursive: true, mode: 0o700 });
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const [name, width, height] of [['wide', 1920, 1080], ['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 568], ['landscape', 844, 390]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const requested: string[] = [];
    page.on('request', request => { if (/\.mp4(?:\?|$)/.test(request.url())) requested.push(request.url()); });
    await page.goto(base);
    await expect(page.locator('.hero-canvas')).toBeVisible();
    assert.equal(requested.length, 0);
    await page.goto(base + '/#demos/ui-product-tour');
    const video = page.locator('video');
    await expect(video).toBeVisible();
    await expect(page.locator('.demo-library')).not.toHaveClass(/demo-library-wide/);
    const wideToggle = page.getByRole('button', { name: 'Wide player', exact: true });
    if (width > 760) {
      await expect(wideToggle).toHaveAttribute('aria-pressed', 'false');
      const index = await page.locator('.demo-library-index').boundingBox();
      const player = await page.locator('.product-demo-section').boundingBox();
      assert.ok(index && player && index.x + index.width < player.x, `${name}: library must start beside the player`);
      const items = await page.locator('.demo-library-item').all();
      for (let i = 1; i < items.length; i++) {
        const previous = (await items[i - 1]!.boundingBox())!;
        const current = (await items[i]!.boundingBox())!;
        assert.ok(Math.abs(current.x - previous.x) <= 1 && current.y > previous.y + previous.height, `${name}: demo menu must be vertical`);
      }
    }
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Number.isFinite(v.duration))).toBe(true);
    const metadata = await video.evaluate((v: HTMLVideoElement) => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, paused: v.paused, fit: getComputedStyle(v).objectFit }));
    assert.deepEqual(metadata, { width: 1920, height: 1080, duration: uiProductTourSeconds, paused: true, fit: 'contain' });
    await video.scrollIntoViewIfNeeded();
    await video.evaluate((v: HTMLVideoElement) => v.play());
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
    await video.evaluate((v: HTMLVideoElement) => v.pause());
    const chapters = name === 'wide' ? uiProductTourChapters : [uiProductTourChapters[0]!, uiProductTourChapters[11]!, uiProductTourChapters.at(-1)!];
    for (const chapter of chapters) {
      await page.locator('.demo-chapters button').filter({ hasText: chapter.title }).click();
      await expect(page.locator('.demo-guide h3')).toHaveText(chapter.title);
      await expect(page.locator('.demo-guide-body')).toContainText(chapter.outcome);
      await video.evaluate((v: HTMLVideoElement) => { v.currentTime += 2; });
      await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2)).toBe(true);
      const pixels = await video.evaluate((v: HTMLVideoElement) => {
        const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(v, 0, 0, 960, 540);
        const rgba = ctx.getImageData(0, 0, 960, 540).data;
        let dark = 0, light = 0;
        for (let i = 0; i < rgba.length; i += 4) { if (rgba[i]! < 80) dark++; if (rgba[i]! > 200) light++; }
        return { dark, light };
      });
      assert.ok(pixels.dark > 40 && pixels.light > 1000, `Blank decoded frame: ${chapter.id}`);
      await video.screenshot({ path: join(output, `${name}-${chapter.id}.png`) });
    }
    if (name === 'wide') {
      await page.getByRole('button', { name: 'Previous chapter', exact: true }).click();
      await expect(page.locator('.demo-guide h3')).toHaveText(uiProductTourChapters.at(-2)!.title);
      await page.getByRole('button', { name: 'Next chapter', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Next chapter', exact: true })).toBeDisabled();
      await video.evaluate((v: HTMLVideoElement) => { v.textTracks[0]!.mode = 'showing'; });
      await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.textTracks[0]!.activeCues?.length ?? 0)).toBe(1);
      await video.evaluate((v: HTMLVideoElement) => v.requestFullscreen());
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO');
      await page.screenshot({ path: join(output, 'native-fullscreen.png') });
      await page.evaluate(() => document.exitFullscreen());
      await page.screenshot({ path: join(output, 'side-by-side-library.png'), fullPage: true });
      await wideToggle.click();
      await expect(wideToggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.demo-library')).toHaveClass(/demo-library-wide/);
      const index = (await page.locator('.demo-library-index').boundingBox())!;
      const player = (await page.locator('.product-demo-section').boundingBox())!;
      assert.ok(index.y >= player.y + player.height, 'Wide mode must place the library below the player');
      await page.screenshot({ path: join(output, 'wide-player-library.png'), fullPage: true });
      await wideToggle.click();
      await expect(wideToggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.demo-library')).not.toHaveClass(/demo-library-wide/);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    for (const el of await page.locator('.demo-library a, .demo-library button').all()) {
      if (await el.isVisible()) assert.ok(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name}: clipped control text`);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(output, `${name}-page.png`), fullPage: true });
    await page.getByRole('button', { name: 'Follow the tutorial', exact: true }).click();
    await expect(page.locator('.docs-body h1')).toHaveText('UI tour: the Harakiri dashboard');
    assert.deepEqual(errors, []);
    results.push({ name, width, height, metadata, chaptersChecked: chapters.length, noOverflow: true, pageErrors: 0 });
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/demos/ui-product-tour/video.mp4*', route => route.abort());
  await page.goto(base + '/#demos/ui-product-tour');
  await expect(page.getByRole('alert')).toContainText('Video unavailable');
  await page.getByRole('button', { name: 'Open the written tutorial' }).click();
  await expect(page.locator('.docs-body h1')).toHaveText('UI tour: the Harakiri dashboard');
  await context.close();
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(base + '/demos/index.html');
  await fallback.getByRole('link', { name: 'UI tour: the Harakiri dashboard' }).click();
  await expect(fallback.locator('video')).toHaveAttribute('controls', '');
  await expect(fallback.getByRole('heading', { name: 'Prove the files survived', exact: true })).toBeVisible();
  await noJs.close();
  await writeJson(join(output, 'result.json'), { checkedAt: new Date().toISOString(), results, defaultVerticalLibrary: true, nativeFullscreen: true, wideToggle: true, captions: true, fallback: true, noJs: true, homepageUnchanged: true });
  console.log('Tour browser QA passed: five viewports, default vertical library, decoded pixels, guide/chapters, captions, fullscreen, width toggle and fallbacks.');
} finally { await browser.close(); }

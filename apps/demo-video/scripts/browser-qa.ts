import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { root } from './io.js';
import { demos } from '../../web/src/demo-catalog.js';

const base = process.argv[2] ?? 'http://localhost:5185';
const output = join(root, 'docs/artifacts/demo/browser-qa', new URL(base).hostname);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const sdkDemo = demos.find(demo => demo.id === 'sdk-agent-report')!;
try {
  for (const [name, width, height, reduced] of [['desktop', 1440, 1000, false], ['wide', 1920, 1080, false], ['mobile', 390, 844, false], ['narrow', 320, 568, false], ['reduced', 390, 844, true]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const mediaRequests: string[] = [];
    page.on('request', (request) => { if (/\.(mp4|webm)(\?|$)/.test(request.url())) mediaRequests.push(request.url()); });
    await page.goto(base);
    await expect(page.locator('.hero-canvas')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    assert.deepEqual(mediaRequests, [], 'Homepage must not download demo video');
    await page.getByRole('button', { name: 'Demos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Demos', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('navigation', { name: 'Workflows' }).getByRole('link').filter({ hasText: sdkDemo.title }).click();
    await expect(page).toHaveURL(/#demos\/sdk-agent-report$/);
    await page.goBack();
    await expect(page).toHaveURL(/#demos$/);
    await page.goForward();
    await expect(page.getByRole('heading', { name: sdkDemo.title, exact: true })).toBeVisible();
    for (const demo of demos) {
      await page.goto(`${base}/#demos/${demo.id}`);
      const video = page.locator('video');
      await expect(video).toBeVisible();
      assert.equal(await video.evaluate((element: HTMLVideoElement) => element.paused), true);
      await video.evaluate(async (element: HTMLVideoElement) => { await element.play(); });
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
      await video.evaluate((element: HTMLVideoElement) => element.pause());
      const chapter = demo.chapters[2]!;
      await page.getByRole('button', { name: new RegExp(chapter.title + '$') }).click();
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(chapter.start);
      await video.evaluate((element: HTMLVideoElement) => { element.currentTime += 4; });
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking && element.readyState >= 2)).toBe(true);
      await video.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const pixels = await video.evaluate((element: HTMLVideoElement, fullFrame: boolean) => {
        const canvas = document.createElement('canvas'); canvas.width = fullFrame ? 960 : 640; canvas.height = fullFrame ? 540 : 256;
        const ctx = canvas.getContext('2d')!;
        // Historical films frame a content panel; the tour preserves the entire app.
        if (fullFrame) ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
        else ctx.drawImage(element, 0, 180, 1920, 768, 0, 0, 640, 256);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0, light = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i] < 90) dark++; if (data[i] > 190) light++; }
        return { dark, light, tracks: element.textTracks.length, duration: element.duration, width: element.videoWidth };
      }, demo.id === 'ui-product-tour');
      if (!(pixels.dark > 20 && pixels.light > 100)) await video.screenshot({ path: join(output, `${name}-${demo.id}-pixel-failure.png`) });
      assert.ok(pixels.dark > 20 && pixels.light > 100, `Decoded video must not be blank: ${demo.id}/${name} ${JSON.stringify(pixels)}`);
      assert.equal(pixels.tracks, 1); assert.equal(pixels.width, 1920); assert.ok(Math.abs(pixels.duration - demo.seconds) < 0.1);
      if (name === 'desktop' && (demo.surface === 'CLI' || demo.id === 'ui-product-tour')) {
        await video.evaluate((element: HTMLVideoElement) => element.requestFullscreen());
        await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO');
        await page.evaluate(() => document.exitFullscreen());
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      for (const element of await page.locator('.demo-library button, .demo-library a').all()) assert.ok(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'Control text overflows');
      await page.screenshot({ path: join(output, `${name}-${demo.id}.png`), fullPage: true });
      if (name === 'desktop') {
        for (const [index, step] of demo.chapters.entries()) {
          await page.getByRole('button', { name: new RegExp(step.title + '$') }).click();
          await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(step.start);
          await video.evaluate((element: HTMLVideoElement) => { element.textTracks[0]!.mode = 'showing'; element.currentTime += 4; });
          await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking && element.readyState >= 2)).toBe(true);
          await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0]?.activeCues?.length ?? 0)).toBe(1);
          await video.screenshot({ path: join(output, `${demo.id}-chapter-${String(index + 1).padStart(2, '0')}.png`) });
        }
      }
      await page.getByRole('button', { name: 'Follow the tutorial' }).click();
      await expect(page.locator('.docs-body').getByRole('heading', { level: 1 })).toContainText(demo.surface, { timeout: 10000 });
      if (demo.id === 'sdk-agent-report') {
        await expect(page.getByRole('heading', { name: 'agentCommand is an ordinary shell string', exact: true })).toBeVisible();
        await expect(page.locator('.docs-body')).toContainText('Use your tools to write and execute the program, not just describe it.');
        await expect(page.locator('.docs-body')).toContainText('260-second timeout');
      }
    }
    await page.goto(`${base}/#demos`);
    await page.getByRole('button', { name: 'SDK', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Workflows' }).getByRole('link')).toHaveCount(demos.filter((demo) => demo.surface === 'SDK').length);
    await expect(page.getByRole('heading', { name: sdkDemo.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Workflows' }).getByRole('link')).toHaveCount(demos.length);
    await context.close();
    console.log(`Verified library: ${name}`);
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(/\/demos\/[^/]+\/video\.mp4(?:\?|$)/, (route) => route.abort());
  await page.goto(`${base}/#demos`);
  await expect(page.getByRole('alert')).toContainText('Video unavailable');
  await page.getByRole('button', { name: 'Open the written tutorial' }).click();
  await expect(page.getByRole('heading', { name: 'UI tour: the Harakiri dashboard', exact: true })).toBeVisible();
  await page.goto(`${base}/#demos/not-a-demo`);
  await expect(page.getByRole('heading', { name: 'Demo not found' })).toBeVisible();
  await context.close();
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(base);
  await fallback.getByRole('link', { name: 'Browse the demo tutorials' }).click();
  await fallback.getByRole('link', { name: 'SDK: generate and retrieve a report' }).click();
  await expect(fallback.getByRole('heading', { name: 'SDK: generate and retrieve a report' })).toBeVisible();
  await expect(fallback.locator('video')).toHaveAttribute('controls', '');
  await expect(fallback.locator('pre').filter({ hasText: 'npm install' })).toContainText('npm install @h-sandbox/sdk@0.4.0');
  await noJs.close();
  if (new URL(base).hostname === 'sb.harakiri.io') {
    const login = await browser.newContext();
    const page = await login.newPage();
    await page.goto(base);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(() => new URL(page.url()).hostname).toBe('sb-auth.harakiri.io');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await login.close();
    console.log('Public sign-in reaches sb-auth.harakiri.io, not a local origin.');
  }
  console.log('Verified missing demo, media failure and no-JavaScript tutorials.');
} finally { await browser.close(); }

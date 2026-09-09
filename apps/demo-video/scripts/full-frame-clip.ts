import assert from 'node:assert/strict';
import type { Locator, Page } from '@playwright/test';
import { recordClip } from './record-clip.js';
import { tourViewport, type UiTour } from '../src/data/ui-tour-schema.js';

export async function fullFrameClip(page: Page, directory: string, id: string, seconds: number, action: (input: TourInput) => Promise<void>) {
  assert.deepEqual(page.viewportSize(), tourViewport, 'Never resize or crop the application for a tour scene');
  const scale = await page.evaluate(() => ({ device: devicePixelRatio, zoom: visualViewport?.scale }));
  assert.deepEqual(scale, { device: 1, zoom: 1 });
  const pointer: UiTour['clips'][number]['pointer'] = [];
  const recorded = await recordClip(page, directory, id, { x: 0, y: 0, ...tourViewport }, { duration: seconds, action: async () => {
    const start = performance.now();
    const point = (x: number, y: number, click: boolean) => pointer.push({ at: (performance.now() - start) / 1000, x, y, click });
    const focus = async (target: Locator) => {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      assert.ok(box, 'The interaction target must be visible');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 12 });
      point(x, y, false);
      await page.waitForTimeout(300);
      await target.click();
      point(x, y, true);
    };
    await action({
      click: focus,
      type: async (target, text) => { await focus(target); await target.fill(''); await target.pressSequentially(text, { delay: 32 }); },
      select: async (target, value) => { await focus(target); await target.selectOption(value); },
      pause: (ms = 800) => page.waitForTimeout(ms),
    });
  } });
  return { ...recorded, pointer };
}
export type TourInput = {
  click: (target: Locator) => Promise<void>;
  type: (target: Locator, text: string) => Promise<void>;
  select: (target: Locator, value: string) => Promise<void>;
  pause: (ms?: number) => Promise<void>;
};

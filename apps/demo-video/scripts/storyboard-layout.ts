import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { workflowIds } from '../src/data/workflow-schema.js';
import { json, root, workspace, writeJson } from './io.js';

const browser = await chromium.launch();
const directory = join(root, 'docs/artifacts/demo/storyboard-layout');
await mkdir(directory, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : workflowIds;
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1280 } });
  for (const id of ids) {
    const workflow = await json(join(workspace, 'public/workflows', id, 'workflow.json'));
    await page.goto(`http://localhost:3300/${id}`);
    await expect(page.getByRole('heading', { name: workflow.scenes[0].title, exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    let start = 0;
    for (const [index, scene] of workflow.scenes.entries()) {
      await page.evaluate(({ frame, id }) => (window as any).remotion_setFrame(frame, id, 0), { frame: (start + 4) * 30, id });
      await expect(page.getByRole('heading', { name: scene.title, exact: true })).toBeVisible();
      await page.waitForTimeout(120);
      const failures = await page.evaluate(() => {
        const failures = [];
        const panel = document.querySelector('[data-scene-panel]');
        const content = document.querySelector('[data-scene-content]');
        if (panel && panel.scrollHeight > panel.clientHeight + 2) failures.push('Panel vertical overflow');
        if (content && content.scrollWidth > content.clientWidth + 2) failures.push('Code horizontal overflow');
        if (content && panel && content.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom - 8) failures.push('Code touches panel bottom');
        return failures;
      });
      assert.deepEqual(failures, [], `${id}: ${scene.title}`);
      await page.screenshot({ path: join(directory, `${id}-${String(index + 1).padStart(2, '0')}.png`) });
      results.push({ id, chapter: scene.title, checkedFrame: (start + 4) * 30 });
      start += scene.seconds;
    }
    console.log(`Layout verified: ${id} / ${workflow.scenes.length} chapters`);
  }
  await writeJson(join(directory, 'report.json'), { checkedAt: new Date().toISOString(), results });
} finally { await browser.close(); }

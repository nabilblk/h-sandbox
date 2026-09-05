import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requirePublishable } from '../src/data/capture-schema.js';
import { json, root, workspace } from './io.js';
import { verifyOutputMetadata } from './output-metadata.js';

const capture = requirePublishable(await json(join(workspace, 'public/capture/capture.json')));
const output = join(root, 'apps/web/public/demo');

async function fixture(run: (path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'demo-output-'));
  try { await cp(output, directory, { recursive: true }); await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('website metadata matches the reviewed capture and shared documentation', async () => {
  await verifyOutputMetadata(output, capture);
});

test('an unexpected or missing public asset fails verification', async () => {
  await fixture(async (directory) => {
    const extra = join(directory, 'unreviewed.txt');
    await writeFile(extra, 'Must not be published');
    await assert.rejects(verifyOutputMetadata(directory, capture), /missing or unexpected/);
    await unlink(extra);
    await unlink(join(directory, 'transcript.md'));
    await assert.rejects(verifyOutputMetadata(directory, capture), /missing or unexpected/);
  });
});

test('caption, transcript and tutorial drift fail verification', async () => {
  for (const file of ['harakiri-product-demo.vtt', 'transcript.md', 'tutorial.html']) {
    await fixture(async (directory) => {
      await writeFile(join(directory, file), 'Stale but credential-free content');
      await assert.rejects(verifyOutputMetadata(directory, capture), /differ/);
    });
  }
});

test('provenance cannot refer to a different capture', async () => {
  const changed = structuredClone(capture);
  changed.runId = 'product-demo-different';
  await assert.rejects(verifyOutputMetadata(output, changed), /provenance differs/);
});

test('public assets cannot be symlinks to unreviewed data', async () => {
  await fixture(async (directory) => {
    const file = join(directory, 'transcript.md');
    await unlink(file);
    await symlink(join(directory, 'provenance.json'), file);
    await assert.rejects(verifyOutputMetadata(directory, capture), /regular file/);
  });
});

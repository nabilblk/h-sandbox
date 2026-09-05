import assert from 'node:assert/strict';
import { readdir, readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workflowIds, workflowSchema } from '../src/data/workflow-schema.js';
import { demos } from '../../web/src/demo-catalog.js';
import { exec, fileHash, json, root, workspace, writeJson } from './io.js';
import { scanImage, extractBoundaryFrames } from './verify-capture.js';
import { assertSanitized, sandboxExampleOrigins } from './sanitize.js';

const scan = !process.argv.includes('--no-ocr');
const temporary = await mkdtemp(join(tmpdir(), 'harakiri-agent-verify-'));
const report: unknown[] = [];
try {
  for (const id of workflowIds) {
    const sourceDir = join(workspace, 'public/workflows', id);
    const target = join(root, 'apps/web/public/demos', id);
    const workflow = workflowSchema.parse(await json(join(sourceDir, 'workflow.json')));
    const provenance = await json(join(target, 'provenance.json'));
    const catalog = demos.find((demo) => demo.id === id)!;
    const origins = ['https://sb-api.harakiri.io'];
    assertSanitized(JSON.stringify(workflow), origins, sandboxExampleOrigins);
    assertSanitized(JSON.stringify(provenance), origins, sandboxExampleOrigins);
    assert.equal(await fileHash(join(sourceDir, 'workflow.json')), provenance.workflowSha256);
    assert.equal(provenance.cleanup, true); assert.ok(provenance.reportedStepCosts.every((cost: number) => cost === 0));
    assert.deepEqual((await readdir(sourceDir)).sort(), ['workflow.json', ...Object.keys(workflow.assets)].sort());
    assert.deepEqual((await readdir(target)).sort(), ['provenance.json', ...Object.keys(provenance.files)].sort());
    for (const [file, hash] of Object.entries(workflow.assets)) {
      assert.equal(await fileHash(join(sourceDir, file)), hash);
      if (scan && file.endsWith('.png')) await scanImage(join(sourceDir, file), origins, sandboxExampleOrigins);
    }
    for (const [file, hash] of Object.entries(provenance.files)) assert.equal(await fileHash(join(target, file)), hash);
    const video = join(target, 'video.mp4');
    const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video])).stdout);
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, 'h264');
    assert.equal(probe.streams[0].width, 1920); assert.equal(probe.streams[0].height, 1080);
    assert.ok(Math.abs(Number(probe.format.duration) - catalog.seconds) < 0.1);
    assert.ok((await stat(video)).size < 10 * 1024 * 1024);
    assert.ok((await stat(join(target, 'poster.webp'))).size < 250 * 1024);
    assert.equal(provenance.durationSeconds, catalog.seconds);
    for (const chapter of catalog.chapters) assert.ok(provenance.chapters.some((item: any) => item.start === chapter.start));
    if (scan) {
      await scanImage(join(target, 'poster.webp'), origins, sandboxExampleOrigins);
      await extractBoundaryFrames(video, temporary, id);
      for (const chapter of provenance.chapters) await exec('ffmpeg', ['-v', 'error', '-y', '-ss', String(chapter.start + 4), '-i', video, '-frames:v', '1', join(temporary, `${id}-${chapter.start}.png`)]);
    }
    report.push({ id, seconds: catalog.seconds, bytes: (await stat(video)).size, cleanup: true, zeroCost: true });
    console.log(`Verified hashes, metadata and catalog: ${id}`);
  }
  if (scan) for (const frame of await readdir(temporary)) await scanImage(join(temporary, frame), ['https://sb-api.harakiri.io'], sandboxExampleOrigins);
  const bundle = join(root, 'apps/web/public/demos/agent-workflows.zip');
  const files = (await exec('unzip', ['-Z1', bundle])).stdout.trim().split('\n').filter((file) => !file.endsWith('/'));
  assert.deepEqual(files.sort(), ['invoice.mjs', 'invoice.spec.mjs', 'cli-prompt.txt', 'orders.csv', 'sdk-report.mjs', 'ui-prompt.txt', 'browser-qa.mjs', 'browser-app.html', 'browser-server.mjs', 'browser-prompt.txt', 'README.md', 'opencode/Dockerfile', 'opencode/harakiri.toml', 'opencode/smoke.sh'].map((file) => `agent-workflows/${file}`).sort());
  for (const file of files) {
    const relative = file.slice('agent-workflows/'.length);
    const source = relative.startsWith('opencode/') ? join(root, 'examples/templates', relative) : join(root, 'examples/demo', file);
    assert.equal((await exec('unzip', ['-p', bundle, file])).stdout, await readFile(source, 'utf8'), `Stale source download: ${file}`);
  }
  await writeJson(join(root, 'docs/artifacts/demo/workflows-verification.json'), { checkedAt: new Date().toISOString(), scan, report });
} finally { await rm(temporary, { recursive: true, force: true }); }

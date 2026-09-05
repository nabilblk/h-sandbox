import assert from 'node:assert/strict';
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { json, workspace, root, writeJson, fileHash, exec } from './io.js';
import sharp from 'sharp';
import { assertSanitized, sandboxExampleOrigins } from './sanitize.js';
import { workflowSchema, type WorkflowScene } from '../src/data/workflow-schema.js';
import { prepareAssets } from './prepare-assets.js';
import { sdkStoryboard } from './sdk-storyboard.js';
import { cliStoryboard, uiStoryboard } from './cli-ui-storyboard.js';
import { browserStoryboard } from './browser-storyboard.js';

await prepareAssets();
const inputFiles = process.argv.slice(2);
assert.ok(inputFiles.length, 'Provide verified cli.json, sdk.json or ui.json paths');
for (const file of inputFiles) {
  const source = await json(file);
  assert.equal(source.cleanup, true, 'Unclean capture cannot be published');
  assert.ok(source.agent.costs.length && source.agent.costs.every((cost: number) => cost === 0));
  assert.ok(source.agent.tools.length && source.agent.tools.every((tool: any) => tool.status === 'completed'));
  let title = ''; let surface = ''; let scenes: WorkflowScene[] = [];
  if (source.id === 'cli-agent-repair') {
    title = 'Repair a bug from the CLI'; surface = 'CLI';
    scenes = cliStoryboard(source);
  } else if (source.id === 'sdk-agent-report') {
    title = 'Turn data into a verified report'; surface = 'SDK';
    assert.equal(source.sourceSha256, await fileHash(join(root, 'examples/demo/agent-workflows/sdk-report.mjs')));
    scenes = sdkStoryboard(source);
  } else if (source.id === 'ui-agent-app') {
    title = 'Build an app from the dashboard'; surface = 'UI';
    scenes = uiStoryboard(source);
  } else {
    assert.equal(source.id, 'browser-agent-qa');
    title = 'Let an agent test your web app'; surface = 'SDK';
    for (const [name, hash] of Object.entries(source.sourceHashes)) {
      assert.equal(await fileHash(join(root, 'examples/demo/agent-workflows', name)), hash, 'Example changed after capture');
    }
    scenes = browserStoryboard(source);
  }
  const target = join(workspace, 'public/workflows', source.id);
  await mkdir(target, { recursive: true });
  const assets: Record<string, string> = {};
  for (const name of new Set(scenes.flatMap((scene) => [scene.video, scene.image]).filter((name): name is string => !!name))) {
    if (name.endsWith('.mp4')) assert.equal(await fileHash(join(dirname(file), name)), source.clips.find((clip: any) => clip.video === name).sha256);
    const input = join(dirname(file), name);
    if (source.id === 'browser-agent-qa') assert.equal(await fileHash(input), source.assets[name]);
    if (source.id === 'ui-agent-app' && /^(preview|create)\./.test(name)) {
      const dimensions = name.endsWith('.mp4')
        ? JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', input])).stdout).streams[0]
        : await sharp(input).metadata();
      const even = (n: number) => Math.floor(n / 2) * 2;
      const crop = name.startsWith('preview')
        ? `${even(dimensions.width! * 0.72)}:${even(dimensions.height! * 0.52)}:${even(dimensions.width! * 0.14)}:${even(dimensions.height! * 0.02)}`
        : `${even(dimensions.width!)}:${even(dimensions.height! * 0.43)}:0:0`;
      await exec('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', `crop=${crop}`, ...(name.endsWith('.mp4') ? ['-c:v', 'libx264', '-crf', '20', '-an', '-map_metadata', '-1', '-movflags', '+faststart'] : ['-frames:v', '1']), join(target, name)]);
    } else await copyFile(input, join(target, name));
    assets[name] = await fileHash(join(target, name));
  }
  const workflow = workflowSchema.parse({ id: source.id, title, surface, scenes, assets, capturedAt: source.capturedAt, model: source.model, version: source.version, sandboxId: source.sandbox.id, templateVersion: source.sandbox.templateVersionId, costs: source.agent.costs, cleanup: true, sourceEvidenceSha256: await fileHash(file) });
  assertSanitized(JSON.stringify(workflow), ['https://sb-api.harakiri.io'], sandboxExampleOrigins);
  await writeJson(join(target, 'workflow.json'), workflow);
  console.log(`Prepared verified workflow: ${source.id}`);
}

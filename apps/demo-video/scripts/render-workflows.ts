import assert from 'node:assert/strict';
import { writeDemoIndex } from './demo-index.js';
import { copyFile, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { workflowIds, workflowSchema } from '../src/data/workflow-schema.js';
import { exec, root, workspace, json, fileHash, writeJson } from './io.js';
import { agentDemoPrerequisites, agentDemoTutorials } from '../../web/src/agent-demo-tutorials.js';
import { assertSanitized, sandboxExampleOrigins } from './sanitize.js';
import { demos } from '../../web/src/demo-catalog.js';
import { workflowCaptions } from './workflow-captions.js';

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const publicDir = join(root, 'apps/web/public/demos');
await mkdir(publicDir, { recursive: true });
const refreshText = process.argv.includes('--refresh-text');
const selectedIds = process.argv.slice(2).filter((arg) => arg !== '--refresh-text');
const ids = selectedIds.length ? selectedIds : [...workflowIds];
for (const id of ids) {
  const sourceDir = join(workspace, 'public/workflows', id);
  const workflow = workflowSchema.parse(await json(join(sourceDir, 'workflow.json')));
  assert.equal(workflow.id, id);
  assertSanitized(JSON.stringify(workflow), ['https://sb-api.harakiri.io'], sandboxExampleOrigins);
  for (const [file, hash] of Object.entries(workflow.assets)) assert.equal(await fileHash(join(sourceDir, file)), hash);
  const target = join(publicDir, id); const output = join(workspace, 'out', id);
  await mkdir(target, { recursive: true }); await mkdir(output, { recursive: true });
  console.log(`${refreshText ? 'Refreshing text assets' : 'Rendering'} ${id}`);
  if (refreshText) {
    const previous = await json(join(target, 'provenance.json'));
    assert.equal(previous.workflowSha256, await fileHash(join(sourceDir, 'workflow.json')), 'Changed workflow requires a full render');
    for (const file of ['video.mp4', 'poster.webp']) assert.equal(await fileHash(join(target, file)), previous.files[file], 'Existing media must match verified provenance');
  } else {
    await exec('pnpm', ['exec', 'remotion', 'render', 'src/index.ts', id, join(output, 'video.mp4'), '--codec=h264', '--crf=26', '--concurrency=4', '--pixel-format=yuv420p', '--color-space=bt709', '--log=error'], { cwd: workspace, timeout: 1800000, maxBuffer: 8000000 });
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', join(output, 'video.mp4'), '-map', '0:v:0', '-c:v', 'copy', '-an', '-map_metadata', '-1', '-movflags', '+faststart', join(target, 'video.mp4')]);
    const posterScene = id === 'ui-agent-app' ? 0 : id === 'browser-agent-qa' ? workflow.scenes.findIndex((scene) => scene.kind === 'image') : workflow.scenes.findIndex((scene) => scene.kind === 'result');
    const posterFrame = (workflow.scenes.slice(0, posterScene).reduce((sum, scene) => sum + scene.seconds, 0) + 4) * 30;
    await exec('pnpm', ['exec', 'remotion', 'still', 'src/index.ts', id, join(output, 'poster.png'), `--frame=${posterFrame}`, '--log=error'], { cwd: workspace, timeout: 180000 });
    await sharp(join(output, 'poster.png')).webp({ quality: 88 }).toFile(join(target, 'poster.webp'));
  }
  let start = 0;
  const chapters = workflow.scenes.map((scene) => { const chapter = { start, title: scene.title, caption: scene.caption, end: start + scene.seconds }; start = chapter.end; return chapter; });
  await writeFile(join(target, 'captions.vtt'), workflowCaptions(chapters));
  const transcript = `# ${workflow.title}\n\nReal execution, edited waiting. CLI output is replayed from recorded text; SDK snippets are source excerpts with educational diagrams. UI footage is recorded in the actual dashboard. No voiceover.\n\nModel: ${workflow.model}. Recorded ${workflow.capturedAt}. Free-model availability can change.\n\n` + workflow.scenes.map((scene, index) => `## ${chapters[index]!.start}s: ${scene.title}\n\n${scene.caption}\n\n${scene.steps?.map((step) => `- **${step.title}:** ${step.detail}\n`).join('') ?? ''}${scene.content ? '```text\n' + (scene.command ? '$ ' + scene.command + '\n' : '') + scene.content + '\n```\n' : ''}`).join('\n');
  await writeFile(join(target, 'transcript.md'), `${transcript.trimEnd()}\n`);
  const tutorial = agentDemoTutorials.find((tutorial) => tutorial.id === id)!;
  const media = demos.find((demo) => demo.id === id)!;
  await writeFile(join(target, 'tutorial.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(tutorial.title)} | Harakiri</title><style>body{font:16px/1.65 system-ui;margin:0;color:#17191b;background:#fafbfa}main{max-width:920px;margin:auto;padding:28px 20px 64px}h1{font-size:32px}h2{font-size:23px;margin-top:36px}a{color:#a52b20}pre{background:#191c1e;color:#eef3f0;padding:20px;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px;font:13px/1.7 monospace}video{width:100%;aspect-ratio:16/9}video::cue{font-size:16px;background:#151819;color:#fff}p{overflow-wrap:anywhere}.check{border-left:3px solid #267849;padding-left:16px}</style><main><nav><a href="/#demos/${id}">Harakiri / Demos</a> | <a href="${escape(media.source)}">Example source</a></nav><h1>${escape(tutorial.title)}</h1><p>${escape(tutorial.lede)}</p><video controls playsinline preload="metadata" poster="${escape(media.poster)}"><source src="${escape(media.video)}" type="video/mp4"><track kind="captions" src="${escape(media.captions)}" srclang="en" label="English"></video><p><a href="${escape(media.transcript)}">Transcript</a> | <a href="${escape(media.provenance)}">Capture details</a></p><p>${escape(agentDemoPrerequisites)}</p><p><a href="https://opencode.ai/docs/zen/">OpenCode model availability and data policies</a></p>${tutorial.sections.map((section) => `<section><h2>${escape(section.title)}</h2><p>${escape(section.text)}</p>${section.code ? `<!--email_off--><pre>${escape(section.code)}</pre><!--/email_off-->` : ''}<p class="check"><strong>Verification:</strong> ${escape(section.check)}</p></section>`).join('')}</main></html>\n`);
  const hashes: Record<string, string> = {};
  for (const file of ['video.mp4', 'poster.webp', 'captions.vtt', 'transcript.md', 'tutorial.html']) { hashes[file] = await fileHash(join(target, file)); await chmod(join(target, file), 0o644); }
  await writeJson(join(target, 'provenance.json'), { id, title: workflow.title, capturedAt: workflow.capturedAt, model: workflow.model, openCodeVersion: '1.15.13', packageVersion: workflow.version, sandboxId: workflow.sandboxId, templateVersion: workflow.templateVersion, cleanup: workflow.cleanup, reportedStepCosts: workflow.costs, durationSeconds: start, chapters, sourceEvidenceSha256: workflow.sourceEvidenceSha256, workflowSha256: await fileHash(join(sourceDir, 'workflow.json')), files: hashes, editing: 'Real CLI output replay; condensed SDK excerpts; real UI recordings. Waiting removed. No speed benchmark or voiceover.' });
  await chmod(join(target, 'provenance.json'), 0o644);
  console.log(`Rendered ${id}: ${start}s`);
}
// Package an explicit source allowlist, never the working directory or .env files.
const bundle = join(workspace, 'out/source-bundle');
await rm(bundle, { recursive: true, force: true });
await mkdir(join(bundle, 'agent-workflows/opencode'), { recursive: true });
for (const file of ['invoice.mjs', 'invoice.spec.mjs', 'cli-prompt.txt', 'orders.csv', 'sdk-report.mjs', 'ui-prompt.txt', 'browser-qa.mjs', 'browser-app.html', 'browser-server.mjs', 'browser-prompt.txt', 'README.md']) await copyFile(join(root, 'examples/demo/agent-workflows', file), join(bundle, 'agent-workflows', file));
for (const file of ['Dockerfile', 'harakiri.toml', 'smoke.sh']) await copyFile(join(root, 'examples/templates/opencode', file), join(bundle, 'agent-workflows/opencode', file));
const dockerfile = await readFile(join(bundle, 'agent-workflows/opencode/Dockerfile'), 'utf8');
assert.deepEqual(dockerfile.split('\n').filter((line) => /^COPY /m.test(line)), ['COPY smoke.sh /usr/local/bin/harakiri-opencode-smoke'], 'Update the source allowlist when template COPY instructions change');
await rm(join(publicDir, 'agent-workflows.zip'), { force: true });
await exec('zip', ['-q', '-r', join(publicDir, 'agent-workflows.zip'), 'agent-workflows'], { cwd: bundle });
await writeDemoIndex();

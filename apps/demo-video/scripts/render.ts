import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { requirePublishable } from '../src/data/capture-schema.js';
import { transcript, vtt } from '../src/data/storyboard.js';
import { exec, root, workspace, writeJson } from './io.js';
import { prepareAssets } from './prepare-assets.js';
import { verifyCapture } from './verify-capture.js';
import { writeTutorial } from './tutorial.js';
import { outputFiles, provenance, verifyOutputMetadata } from './output-metadata.js';

const capture = requirePublishable(await verifyCapture(join(workspace, 'public/capture'), false));
await prepareAssets();
const output = join(workspace, 'out');
const target = join(root, 'apps/web/public/demo');
await mkdir(output, { recursive: true });
await mkdir(target, { recursive: true });
for (const [composition, name, crf] of [['HarakiriProductDemo', 'harakiri-product-demo', '27'], ['HarakiriHeroLoop', 'harakiri-hero-loop', '30']]) {
  console.log(`Rendering ${composition}`);
  await exec('pnpm', ['exec', 'remotion', 'render', 'src/index.ts', composition, join(output, `${name}.mp4`), '--codec=h264', `--crf=${crf}`, '--pixel-format=yuv420p', '--color-space=bt709', '--log=error'], { cwd: workspace, timeout: 1_800_000, maxBuffer: 8_000_000 });
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', join(output, `${name}.mp4`), '-map', '0:v:0', '-c:v', 'copy', '-an', '-map_metadata', '-1', '-movflags', '+faststart', join(target, `${name}.mp4`)]);
}
await exec('pnpm', ['exec', 'remotion', 'still', 'src/index.ts', 'HarakiriProductDemo', join(output, 'poster.png'), '--frame=1125', '--log=error'], { cwd: workspace, timeout: 180_000 });
await sharp(join(output, 'poster.png')).webp({ quality: 84 }).toFile(join(target, 'harakiri-product-demo.webp'));
await exec('pnpm', ['exec', 'remotion', 'still', 'src/index.ts', 'HarakiriHeroLoop', join(output, 'hero-poster.png'), '--frame=30', '--log=error'], { cwd: workspace, timeout: 180_000 });
await sharp(join(output, 'hero-poster.png')).webp({ quality: 84 }).toFile(join(target, 'harakiri-hero-loop.webp'));
await writeFile(join(target, 'harakiri-product-demo.vtt'), vtt());
await writeFile(join(target, 'transcript.md'), transcript());
await writeTutorial(target);
await writeJson(join(target, 'provenance.json'), provenance(capture));
// Only approved website output is public; raw capture JSON stays owner-only.
await chmod(target, 0o755);
for (const file of outputFiles) await chmod(join(target, file), 0o644);
await verifyOutputMetadata(target, capture);
console.log('Rendered assets. Run pnpm demo:verify before publication.');

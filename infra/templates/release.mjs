import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const catalog = JSON.parse(readFileSync(join(root, 'infra/templates/catalog.json'), 'utf8')).templates;
export function releaseInput(env) {
  const template = catalog.find((item) => item.name === env.TEMPLATE_NAME);
  assert.ok(template, 'Choose an existing catalog TEMPLATE_NAME');
  const registry = env.HARBOR_REGISTRY || 'core.campus.clusterdiali.me';
  const project = env.HARBOR_PROJECT || 'harakiri';
  const tag = env.TEMPLATE_TAG;
  assert.match(registry, /^[a-z0-9][a-z0-9.:-]*$/);
  assert.match(project, /^[a-z0-9][a-z0-9._-]*$/);
  assert.match(tag || '', /^(?:\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?|sha-[a-f0-9]{12,40}(?:-\d+-\d+)?)$/, 'Use a release version or source SHA/run tag, never latest');
  const platform = env.TEMPLATE_PLATFORM || 'linux/amd64';
  assert.ok(['linux/amd64', 'linux/arm64'].includes(platform), 'Smoke one concrete architecture at a time');
  return { ...template, platform, image: `${registry}/${project}/templates/${template.name}:${tag}` };
}

function main() {
  if (process.argv[2] === 'matrix') { console.log(JSON.stringify(catalog)); return; }
  const input = releaseInput(process.env);
  const run = (args) => execFileSync('docker', args, { stdio: 'inherit' });
  const context = join(root, 'examples/templates', input.name);
  assert.ok(existsSync(join(context, 'Dockerfile')) && existsSync(join(context, 'smoke.sh')));
  run(['buildx', 'build', '--platform', input.platform, '--load', '--tag', input.image, context]);
  for (const user of ['0:0', '1001230000:0']) {
    run(['run', '--rm', '--platform', input.platform, '--user', user, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--entrypoint', input.smoke, input.image]);
  }
  console.log(`Template ${input.name}: ${input.platform}, root and arbitrary-UID smoke passed`);
  if (process.argv[2] !== 'publish') return;
  // Publish only an image that passed both local runtime checks. No alias promotion.
  run(['push', input.image]);
  const manifest = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', input.image, '--format', '{{json .Manifest}}'], { encoding: 'utf8' }));
  assert.match(manifest.digest, /^sha256:[a-f0-9]{64}$/);
  const output = resolve(process.env.TEMPLATE_EVIDENCE_DIR || join(root, 'docs/artifacts/template-releases'));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `${input.name}-${input.platform.split('/')[1]}.json`), JSON.stringify({ ...input, digest: manifest.digest, immutableImage: `${input.image.slice(0, input.image.lastIndexOf(':'))}@${manifest.digest}`, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--', 'examples/templates', 'infra/templates'], { cwd: root, encoding: 'utf8' }).trim()), verifiedAt: new Date().toISOString(), tests: ['root', 'arbitrary-uid'], providerAcceptance: 'not-run' }, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

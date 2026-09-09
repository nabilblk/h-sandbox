import assert from 'node:assert/strict';
import { writeJson, root, json, sha256, fileHash } from './io.js';
import { join } from 'node:path';
import { demos } from '../../web/src/demo-catalog.js';

const base = process.argv[2] ?? 'http://localhost:5190';
const results: { path: string; status: number; type: string | null }[] = [];
function verifyCache(response: Response) {
  const cache = response.headers.get('cache-control') ?? '';
  const age = Number(cache.match(/max-age=(\d+)/)?.[1]);
  if (response.headers.get('server') === 'cloudflare') {
    assert.ok(age >= 3600 && age <= 14400, `Unexpected edge cache policy: ${cache}`);
    assert.match(cache, /must-revalidate/);
  } else assert.match(cache, /max-age=3600/);
}
for (const demo of demos) {
  const expected = await json(join(root, 'apps/web/public/demos', demo.id, 'provenance.json'));
  const provenance = await fetch(new URL(demo.provenance, base));
  assert.equal(provenance.status, 200);
  assert.deepEqual(await provenance.json(), expected, 'Published provenance must match the current build');
  for (const path of [demo.video, demo.poster, demo.captions, demo.transcript]) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, path);
    const filename = new URL(path, base).pathname.split('/').at(-1)!;
    const hash = typeof expected.files[filename] === 'string' ? expected.files[filename] : expected.files[filename].sha256;
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, `Stale public asset: ${path}`);
  }
  for (const [path, type] of [[demo.video, 'video/mp4'], [demo.poster, 'image/webp'], [demo.captions, 'text/vtt'], [demo.transcript, 'text/markdown'], [demo.provenance, 'application/json'], [`/demos/${demo.id}/tutorial.html`, 'text/html']]) {
    const response = await fetch(new URL(path!, base), { method: 'HEAD' });
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type')?.startsWith(type!));
    verifyCache(response);
    results.push({ path: path!, status: response.status, type: response.headers.get('content-type') });
  }
  const response = await fetch(new URL(demo.video, base), { headers: { Range: 'bytes=0-1023' } });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 1024);
}
assert.equal((await fetch(new URL('/demos/missing/video.mp4', base))).status, 404);
assert.equal((await fetch(new URL('/demos/agent-workflows.zip', base), { method: 'HEAD' })).status, 200);
for (const source of new Set(demos.map(demo => demo.source))) {
  const url = new URL(source, base);
  const sourceBundle = await fetch(url);
  assert.equal(sha256(Buffer.from(await sourceBundle.arrayBuffer())), await fileHash(join(root, 'apps/web/public', url.pathname)));
}
for (const [path, type] of [
  ['/demo/harakiri-product-demo.mp4', 'video/mp4'],
  ['/demo/harakiri-hero-loop.mp4', 'video/mp4'],
  ['/demo/harakiri-product-demo.webp', 'image/webp'],
  ['/demo/harakiri-hero-loop.webp', 'image/webp'],
  ['/demo/harakiri-product-demo.vtt', 'text/vtt'],
  ['/demo/transcript.md', 'text/markdown'],
  ['/demo/provenance.json', 'application/json'],
  ['/demo/tutorial.html', 'text/html'],
]) {
  const response = await fetch(new URL(path!, base), { method: 'HEAD' });
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get('content-type')?.startsWith(type!), `Incorrect MIME type for ${path}`);
  verifyCache(response);
  results.push({ path: path!, status: response.status, type: response.headers.get('content-type') });
}
const partial = await fetch(new URL('/demo/harakiri-product-demo.mp4', base), { headers: { Range: 'bytes=0-1023' } });
assert.equal(partial.status, 206);
assert.match(partial.headers.get('content-range') ?? '', /^bytes 0-1023\/\d+$/);
assert.equal((await partial.arrayBuffer()).byteLength, 1024);
const missing = await fetch(new URL('/demo/does-not-exist.mp4', base));
assert.equal(missing.status, 404, 'Missing media must not return the SPA document');
await writeJson(join(root, 'docs/artifacts/demo/server-qa.json'), {
  base, checkedAt: new Date().toISOString(), results, byteRange: 206, missing: 404, currentAssetHashes: true, sourceBundleHash: true,
});
console.log('Verified all media MIME types, revalidation, byte-range seeking and missing-media 404.');

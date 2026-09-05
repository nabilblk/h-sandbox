import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDemoServer } from './server.mjs';

test('demo app serves run-specific readiness, UI, assets, and honest 404s', async () => {
  const server = createDemoServer({ run: 'demo-test', startedAt: '2026-09-05T00:00:00.000Z' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).run, 'demo-test');
    assert.match(await (await fetch(base)).text(), /Your sandbox/);
    assert.equal((await fetch(`${base}/mark.svg`)).headers.get('content-type'), 'image/svg+xml');
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

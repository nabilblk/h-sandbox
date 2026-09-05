import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { demoApi, cleanupRuntime, poll } from './api.js';

test('empty DELETE has no JSON content type and verifies terminal state plus routes', async () => {
  let deleted = false;
  const server = createServer((request, response) => {
    assert.equal(request.headers['x-api-key'], 'test-only');
    if (request.method === 'DELETE') { assert.equal(request.headers['content-type'], undefined); deleted = true; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.method === 'DELETE' ? { ok: true } : request.url?.endsWith('/routes') ? { routes: [{ state: 'terminated' }] } : { sandbox: { status: deleted ? 'terminated' : 'running' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const api = demoApi(`http://127.0.0.1:${address.port}`, 'test-only');
    await cleanupRuntime(api, 'sbx_test');
    await cleanupRuntime(api, 'sbx_test');
    assert.equal(deleted, true);
  } finally { server.close(); }
});
test('failed readiness does not become a successful poll', async () => {
  await assert.rejects(poll(async () => 'running', (state) => state === 'terminated', 0), /Timed out/);
});

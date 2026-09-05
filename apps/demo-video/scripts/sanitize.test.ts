import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, assertSanitized, sandboxExampleOrigins } from './sanitize.js';

test('redacts secrets, personal data, ANSI and configured values', () => {
  const text = '\u001b[32mhk_live_testsecret user@example.com /Users/private SG.fake.fake password=hidden Bearer abcdefghijklmnop exact-password';
  const result = sanitize(text, ['exact-password']);
  for (const secret of ['testsecret', 'user@example', '/Users/private', 'SG.fake', 'hidden', 'abcdefghijklmnop', 'exact-password']) assert.ok(!result.includes(secret));
});
test('only explicitly reviewed sandbox fixture URLs are allowed in educational scenes', () => {
  assert.doesNotThrow(() => assertSanitized('curl http://127.0.0.1:3000/health', [], sandboxExampleOrigins));
  for (const value of ['http://127.0.0.1:18084', 'http://localhost:3000', 'http://127.0.0.1:3000?secret=yes', 'http://user:secret@127.0.0.1:3000', '127.0.0.1', 'http://10.1.2.3']) {
    assert.throws(() => assertSanitized(value, [], sandboxExampleOrigins));
  }
  assert.throws(() => assertSanitized('http://127.0.0.1:3000', ['http://127.0.0.1:3000']));
});
test('rejects unapproved, private and credential-bearing URLs', () => {
  for (const text of ['http://localhost:3000', 'https://private.invalid/path', 'https://public.example/?code=secret', 'https://user:pass@public.example/']) assert.throws(() => assertSanitized(text, ['https://public.example']));
  assert.doesNotThrow(() => assertSanitized('https://public.example/route /workspace/server.mjs', ['https://public.example']));
});

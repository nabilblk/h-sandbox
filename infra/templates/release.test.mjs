import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, releaseInput } from './release.mjs';

test('all existing templates have explicit runtime smoke commands', () => {
  assert.equal(new Set(catalog.map(({ name }) => name)).size, 6);
  for (const item of catalog) assert.match(item.smoke, /^harakiri-[a-z0-9-]+-smoke$/);
});
test('release inputs reject floating tags, unknown templates and shell injection', () => {
  const input = { TEMPLATE_NAME: 'opencode', TEMPLATE_TAG: 'sha-123456789abc' };
  assert.equal(releaseInput(input).platform, 'linux/amd64');
  for (const override of [{ TEMPLATE_TAG: 'latest' }, { TEMPLATE_NAME: '../private' }, { HARBOR_REGISTRY: 'https://host' }, { TEMPLATE_PLATFORM: 'linux/amd64;echo bad' }]) assert.throws(() => releaseInput({ ...input, ...override }));
});

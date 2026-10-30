import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, releaseInput, releaseMatrix } from './release.mjs';

test('all existing templates have explicit runtime smoke commands', () => {
  assert.equal(new Set(catalog.map(({ name }) => name)).size, 7);
  for (const item of catalog) assert.match(item.smoke, /^harakiri-[a-z0-9-]+-smoke$/);
});
test('publication can select one existing template without widening its scope', () => {
  assert.deepEqual(releaseMatrix(), catalog);
  assert.deepEqual(releaseMatrix('all'), catalog);
  assert.deepEqual(releaseMatrix('open-terminal'), [catalog.find(({ name }) => name === 'open-terminal')]);
  for (const selection of ['', '../private', 'open-terminal; echo bad', 'open-terminal,opencode', 'missing']) {
    assert.throws(() => releaseMatrix(selection), /existing catalog template/);
  }
});
test('release inputs reject floating tags, unknown templates and shell injection', () => {
  const input = { TEMPLATE_NAME: 'opencode', TEMPLATE_TAG: 'sha-123456789abc' };
  assert.equal(releaseInput(input).platform, 'linux/amd64');
  assert.deepEqual(releaseInput(input).users, ['0:0', '1001230000:0']);
  assert.deepEqual(releaseInput({ ...input, TEMPLATE_NAME: 'open-terminal' }).users, ['1000:0', '1001230000:0']);
  for (const override of [{ TEMPLATE_TAG: 'latest' }, { TEMPLATE_NAME: '../private' }, { HARBOR_REGISTRY: 'https://host' }, { TEMPLATE_PLATFORM: 'linux/amd64;echo bad' }]) assert.throws(() => releaseInput({ ...input, ...override }));
});

import { basename } from 'node:path';
import { demoApi, cleanupRuntime } from './api.js';
import { exec, json, required } from './io.js';

const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm demo:cleanup <recovery.json>');
const state = await json(path);
if (!/^(product-demo-[a-z0-9-]+|agent-demos-\d+|ui-agent-\d+|browser-qa-\d+)$/.test(state.runId)) throw new Error('Invalid recovery run ID');
const apiUrl = required('HARAKIRI_API_URL');
if (state.apiUrl !== apiUrl) throw new Error('Recovery target does not match HARAKIRI_API_URL');
const api = demoApi(apiUrl, required('HARAKIRI_API_KEY'));
try {
  const names = new Set([state.runId, `${state.runId}-cli`, `${state.runId}-sdk`]);
  const matching = (await api(`/v1/sandboxes?q=${encodeURIComponent(state.runId)}`)).sandboxes.filter((item: { name: string }) => names.has(item.name));
  if (state.sandboxId) {
    const saved = (await api(`/v1/sandboxes/${encodeURIComponent(state.sandboxId)}`)).sandbox;
    if (!names.has(saved.name)) throw new Error('Recovery sandbox name no longer matches this recording');
    if (!matching.some((item: { id: string }) => item.id === saved.id)) matching.push(saved);
  }
  for (const sandbox of matching) await cleanupRuntime(api, sandbox.id, sandbox.id === state.sandboxId ? state.routeUrl : undefined);
} finally {
  const name = `harakiri-${state.runId}`;
  const containers = await exec('docker', ['container', 'ls', '-aq', '--filter', `name=^/${name}$`]);
  if (containers.stdout.trim()) await exec('docker', ['rm', '-f', name]);
  if ((await exec('docker', ['container', 'ls', '-aq', '--filter', `name=^/${name}$`])).stdout.trim()) throw new Error('CLI container cleanup incomplete');
}
console.log(`Cleanup verified for ${basename(path)}`);

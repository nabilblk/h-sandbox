import test from 'node:test';
import assert from 'node:assert/strict';
import { definitions, originForwards } from './local-services.mjs';

test('lab supervision uses separate jobs, explicit kubeconfig, loopback binds and existing named tunnel', () => {
  const jobs = definitions({ home: '/home/test', repo: '/code/repo with spaces', bin: { kubectl: '/bin/kubectl', limactl: '/bin/limactl', cloudflared: '/bin/cloudflared' }, config: '/private/config.yml', logs: '/private/logs' });
  assert.equal(jobs.length, 6);
  assert.equal(new Set(jobs.map((job) => job.Label)).size, jobs.length);
  for (const origin of originForwards) {
    const job = jobs.find((item) => item.Label.endsWith(`forward-${origin.name}`));
    assert.ok(job.ProgramArguments.includes('--address=127.0.0.1'));
    assert.ok(job.ProgramArguments.includes('/code/repo with spaces/infra/k0s/harakiri.kubeconfig'));
    assert.equal(job.KeepAlive, true);
  }
  assert.deepEqual(jobs[0].KeepAlive, { SuccessfulExit: false });
  assert.equal(jobs[0].AbandonProcessGroup, true);
  assert.deepEqual(jobs.at(-1).ProgramArguments.slice(-2), ['run', 'harakiri-dev']);
  assert.ok(!JSON.stringify(jobs).includes('--token'));
  assert.ok(!JSON.stringify(jobs).includes('com.labs.cloudflared'));
});

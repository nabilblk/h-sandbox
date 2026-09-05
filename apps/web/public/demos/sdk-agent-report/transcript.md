# Turn data into a verified report

Real execution, edited waiting. CLI output is replayed from recorded text; SDK snippets are source excerpts with educational diagrams. UI footage is recorded in the actual dashboard. No voiceover.

Model: opencode/mimo-v2.5-free. Recorded 2026-09-05T14:50:45.937Z. Free-model availability can change.

## 0s: From an order export to a checked report

A daily order export becomes a checked JSON report and a written summary. The agent must create and execute the analysis.

- **Order export:** Four synthetic orders. Count paid orders, total paid revenue, and count refunds.
- **Agent-written analysis:** OpenCode creates analyze.py and runs it with Python inside a disposable sandbox.
- **Checked deliverables:** Your worker downloads report.json and summary.md, asserts the totals, then cleans up.

## 18s: What runs where?

Your worker coordinates through Harakiri. OpenCode and Python run in the sandbox; model inference is external.

- **Your Node.js worker:** Holds the Harakiri API key. Creates the sandbox, uploads data, tracks the job, verifies files.
- **Harakiri sandbox:** Hosts OpenCode and its tools. The agent reads orders.csv, writes code, and executes Python.
- **External free model:** OpenCode calls the selected provider. Inference is not local. Only synthetic data is used.

## 34s: Define success before starting the agent

Paid revenue: 2500 + 19900 + 7200 = 29600 cents. Exclude the refunded order. Keep the input unchanged.

```text
id,item,total_cents,status
1,Notebook,2500,paid
2,Monitor,19900,paid
3,Adapter,7000,refunded
4,Keyboard,7200,paid
```

## 52s: Prepare the Node.js worker

Install the SDK on your worker. Set the Harakiri API URL and key privately. The sandbox template already contains OpenCode.

```text
npm install @h-sandbox/sdk@0.4.0
export OPENCODE_MODEL=opencode/mimo-v2.5-free
node sdk-report.mjs
```

## 68s: Create an isolated OpenCode workspace

Keep the returned sandbox ID. Wait until running. The 600-second TTL is a fallback; cleanup still runs in finally.

```text
import { HarakiriClient } from '@h-sandbox/sdk';
const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const client = new HarakiriClient({ apiUrl, apiKey });
const { sandbox } = await client.createSandbox({
  template: 'opencode', ttlSeconds: 600, wait: true,
});
await client.waitForSandbox(sandbox.id, {
  statuses: ['running'], timeoutMs: 90000,
});
```

## 86s: Transfer the input through the SDK

Upload data, not a prewritten analysis. /workspace is the remote sandbox directory. Retain the local input for verification.

```text
const csv = await readFile(
  new URL('./orders.csv', import.meta.url), 'utf8'
);
await client.files.write(sandbox.id, {
  path: '/workspace/orders.csv', content: csv,
  encoding: 'utf8', createParents: true,
});
```

## 100s: Make the free-model choice explicit

Pin both main and small models to the free model. Broad tool permissions apply only to this synthetic, disposable demo.

```text
const model = process.env.OPENCODE_MODEL ?? 'opencode/mimo-v2.5-free';
await client.files.write(sandbox.id, {
  path: '/workspace/opencode.json',
  content: JSON.stringify({
    model, small_model: model, enabled_providers: ['opencode'],
    share: 'disabled', autoupdate: false,
    permission: { '*': 'allow' },
  }),
  encoding: 'utf8',
});
```

## 118s: Give the agent the complete task

The complete prompt specifies input, program, output schema, execution and an unchanged CSV. No hidden instructions.

```text
const prompt = [
  'Read orders.csv.',
  'Write analyze.py using only the Python standard library.',
  'It must sum total_cents only for paid rows and count refunded rows.',
  'Execute it to create report.json with exactly paid_orders,',
  'revenue_cents, refunded_orders integer fields,',
  'and summary.md with a short business summary.',
  'Do not modify orders.csv.',
  'Use your tools to write and execute the program, not just describe it.',
].join(' ');
```

## 142s: agentCommand is an ordinary shell string

run: non-interactive task. --format json: execution events. --model: explicit model. shellQuote keeps the prompt one argument.

```text
const shellQuote = (value) =>
  "'" + value.replaceAll("'", "'\\''") + "'";

const agentCommand =
  `opencode run --format json --model ${model} ${shellQuote(prompt)}`;
```

## 164s: Start a tracked background command

agentCommand runs in /workspace. detached returns a job ID. timeoutMs limits command execution to four minutes.

```text
const started = await client.commands.start(sandbox.id, {
  command: agentCommand, cwd: '/workspace',
  timeoutMs: 240000, detached: true,
});
console.log('OpenCode job', started.command.id);
```

## 184s: Wait for completion and inspect the logs

260 seconds is the caller waiting budget, not a longer execution limit. Read logs before cleanup. Exit 0 alone is not acceptance.

```text
const result = await client.commands.wait(
  sandbox.id, started.command.id, { timeoutMs: 260000 }
);
assert.equal(result.command.exitCode, 0, 'Agent command failed');
const logs = await client.commands.logs(
  sandbox.id, started.command.id
);
```

## 204s: Inspect real work, not an agent promise

These are completed tools from the real run. The script checks zero reported model cost; private reasoning is not published.

```text
read     /workspace/orders.csv
write    /workspace/analyze.py
bash     python analyze.py
bash     python3 analyze.py
read     /workspace/report.json
read     /workspace/summary.md
```

## 220s: Retrieve files before destroying the runtime

Download JSON, summary and original input before termination. contentBase64 is the file envelope, not the agent answer.

```text
const downloaded = await client.files.download(
  sandbox.id, '/workspace/report.json'
);
const summaryFile = await client.files.download(
  sandbox.id, '/workspace/summary.md'
);
const original = await client.files.download(
  sandbox.id, '/workspace/orders.csv'
);
const report = JSON.parse(
  Buffer.from(downloaded.contentBase64, 'base64').toString('utf8')
);
```

## 238s: Make your application the final judge

Assert exact totals and unchanged input before saving. The summary must be nonempty; its prose needs separate review.

```text
assert.deepEqual(report, {
  paid_orders: 3, revenue_cents: 29600, refunded_orders: 1,
});
assert.equal(
  Buffer.from(original.contentBase64, 'base64').toString('utf8'),
  csv, 'Agent modified input data'
);
const summary = Buffer.from(summaryFile.contentBase64, 'base64')
  .toString('utf8');
assert.ok(summary.trim().length > 0);
```

## 260s: The verified result is now in your worker

Verified JSON and summary are saved in your worker. This recording passed; future agent runs must pass the same checks.

```text
{
  "paid_orders": 3,
  "revenue_cents": 29600,
  "refunded_orders": 1
}
```

## 278s: Always clean up, including on failure

finally handles success and failure. Verify terminated. If connectivity prevents cleanup, recover using the sandbox ID and TTL.

```text
finally {
  await client.killSandbox(sandbox.id);
  const ended = await client.waitForSandbox(sandbox.id, {
    statuses: ['terminated'], timeoutMs: 30000,
  });
  assert.equal(ended.sandbox.status, 'terminated');
  console.log('Cleaned up', sandbox.id);
}
```

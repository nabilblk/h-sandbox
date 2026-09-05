export const sdkDemoPrompt = [
  'Read orders.csv.',
  'Write analyze.py using only the Python standard library.',
  'It must sum total_cents only for paid rows and count refunded rows.',
  'Execute it to create report.json with exactly paid_orders,',
  'revenue_cents, refunded_orders integer fields,',
  'and summary.md with a short business summary.',
  'Do not modify orders.csv.',
  'Use your tools to write and execute the program, not just describe it.',
].join(' ');

export const sdkPromptCode = `const prompt = [
  'Read orders.csv.',
  'Write analyze.py using only the Python standard library.',
  'It must sum total_cents only for paid rows and count refunded rows.',
  'Execute it to create report.json with exactly paid_orders,',
  'revenue_cents, refunded_orders integer fields,',
  'and summary.md with a short business summary.',
  'Do not modify orders.csv.',
  'Use your tools to write and execute the program, not just describe it.',
].join(' ');`;

export const sdkCommandCode = [
  'const shellQuote = (value) =>',
  '  "\'" + value.replaceAll("\'", "\'\\\\\'\'") + "\'";',
  '',
  'const agentCommand =',
  '  `opencode run --format json --model ${model} ${shellQuote(prompt)}`;',
].join('\n');

type SdkDemoStep = {
  id: string; title: string; chapter: string; seconds: number;
  text: string; code: string; check: string;
};

// One chapter outline feeds the film, written tutorial and player timestamps.
export const sdkDemoSteps: SdkDemoStep[] = [
  {
    id: 'use-case', title: 'From an order export to a checked report', chapter: 'Use case', seconds: 18,
    text: 'Imagine a Node.js worker receiving a daily order export. It asks an agent to write and run an analysis program in a disposable sandbox, then retrieves a machine-readable report and a short summary. This small synthetic fixture makes the result independently auditable; a fixed production calculation may be better served by ordinary deterministic ETL.',
    code: '',
    check: 'The deliverable is real files, not a chat answer. Harakiri runs the workspace and transports the files; OpenCode writes and executes the analysis.',
  },
  {
    id: 'boundary', title: 'What runs where?', chapter: 'Execution boundary', seconds: 16,
    text: 'Your Node.js process is the coordinator. The Harakiri SDK calls your control plane to create a sandbox, transfer files and track a command. OpenCode and its Python tools run inside that sandbox. OpenCode contacts the selected external model provider; sandboxing does not make inference local or prevent the agent from sending input to that provider.',
    code: '',
    check: 'Keep the Harakiri API key in your worker, not in the sandbox. Use only synthetic data with this free provider and permissive demo tool policy.',
  },
  {
    id: 'input', title: 'Define success before starting the agent', chapter: 'Input and acceptance', seconds: 18,
    text: 'The four-row orders.csv fixture has three paid orders and one refunded order. Add 2500 + 19900 + 7200 to get 29600 cents. Exclude the refunded 7000 cents. Expected paid_orders is 3 and refunded_orders is 1. These expectations are defined by the caller, not by the agent.',
    code: 'id,item,total_cents,status\n1,Notebook,2500,paid\n2,Monitor,19900,paid\n3,Adapter,7000,refunded\n4,Keyboard,7200,paid',
    check: 'The original CSV must remain byte-for-byte unchanged. Generated prose is reviewed separately; only the exact report totals are independently asserted.',
  },
  {
    id: 'setup', title: 'Prepare the Node.js worker', chapter: 'Prerequisites', seconds: 16,
    text: 'Download and extract the example source, then work in agent-workflows with Node.js 22 or later. Your organization needs a ready opencode template. Set HARAKIRI_API_URL and HARAKIRI_API_KEY privately before running the script. This recording uses the published SDK 0.4.0, not a workspace build. The npm command installs the SDK on your worker; OpenCode is already in the sandbox template.',
    code: 'npm install @h-sandbox/sdk@0.4.0\nexport OPENCODE_MODEL=opencode/mimo-v2.5-free\nnode sdk-report.mjs',
    check: 'No paid LLM API key is required by the model used in the recording. Free model availability can change: stop on unavailability rather than silently choosing a paid model.',
  },
  {
    id: 'create', title: 'Create an isolated OpenCode workspace', chapter: 'Create the sandbox', seconds: 18,
    text: 'Read the API endpoint and API key from the worker environment. createSandbox returns a sandbox object; keep its ID for every later call and for recovery. The opencode template supplies the runtime. The full example sets a name and enters try/finally immediately after creation.',
    code: `import { HarakiriClient } from '@h-sandbox/sdk';
const apiUrl = process.env.HARAKIRI_API_URL;
const apiKey = process.env.HARAKIRI_API_KEY;
const client = new HarakiriClient({ apiUrl, apiKey });
const { sandbox } = await client.createSandbox({
  template: 'opencode', ttlSeconds: 600, wait: true,
});
await client.waitForSandbox(sandbox.id, {
  statuses: ['running'], timeoutMs: 90000,
});`,
    check: 'The runtime is running before file or command operations. A 600-second TTL bounds abandoned runtime lifetime; it does not replace explicit cleanup.',
  },
  {
    id: 'upload', title: 'Transfer the input through the SDK', chapter: 'Upload the CSV', seconds: 14,
    text: 'Read the local fixture beside sdk-report.mjs, then upload its contents through files.write. /workspace is inside the remote sandbox, not a mount of your local working directory. createParents creates missing parent directories.',
    code: `const csv = await readFile(
  new URL('./orders.csv', import.meta.url), 'utf8'
);
await client.files.write(sandbox.id, {
  path: '/workspace/orders.csv', content: csv,
  encoding: 'utf8', createParents: true,
});`,
    check: 'The worker keeps csv for a later byte-for-byte comparison. It does not upload an existing analyze.py or precomputed report.',
  },
  {
    id: 'model', title: 'Make the free-model choice explicit', chapter: 'OpenCode configuration', seconds: 18,
    text: 'The example permits only an explicit opencode/*-free model and writes opencode.json in the working directory. model selects the main model; small_model avoids an unintended auxiliary-model choice. Only the opencode provider is enabled. Sharing and automatic updates are disabled. These settings do not override provider retention policies.',
    code: `const model = process.env.OPENCODE_MODEL ?? 'opencode/mimo-v2.5-free';
await client.files.write(sandbox.id, {
  path: '/workspace/opencode.json',
  content: JSON.stringify({
    model, small_model: model, enabled_providers: ['opencode'],
    share: 'disabled', autoupdate: false,
    permission: { '*': 'allow' },
  }),
  encoding: 'utf8',
});`,
    check: 'The broad tool permission is only for this disposable synthetic demonstration. Production workloads need an appropriate tool and outbound-access policy.',
  },
  {
    id: 'prompt', title: 'Give the agent the complete task', chapter: 'The full prompt', seconds: 24,
    text: 'This is the entire prompt, not a placeholder. It names the input, asks for an actual Python program, defines the exact output schema, forbids changing the CSV and explicitly asks the agent to execute its tools. Joining the lines produces one instruction string.',
    code: sdkPromptCode,
    check: 'The acceptance criteria remain in the worker. Telling an agent not to modify input is an instruction, not an enforced filesystem restriction; the later comparison detects changes.',
  },
  {
    id: 'command', title: 'agentCommand is an ordinary shell string', chapter: 'Define agentCommand', seconds: 22,
    text: 'agentCommand is not an SDK method, a hidden agent service or JavaScript running in the sandbox. It is the command string passed to commands.start. opencode run starts a non-interactive task; --format json emits structured execution events, not the business report; --model selects the provider/model. The final positional argument is the full prompt. shellQuote keeps spaces, apostrophes and shell metacharacters in one literal argument.',
    code: sdkCommandCode,
    check: 'Constructing this string does not start anything. The next SDK call runs it in the sandbox. The selected model is separately restricted by the example to an explicit free-model identifier.',
  },
  {
    id: 'start', title: 'Start a tracked background command', chapter: 'Start the agent', seconds: 20,
    text: 'The SDK sends the shell string to the sandbox identified by sandbox.id. cwd selects /workspace, where OpenCode finds the CSV and configuration. detached:true starts a tracked command and returns a command ID without waiting for the agent to finish. timeoutMs is a four-minute command execution limit.',
    code: `const started = await client.commands.start(sandbox.id, {
  command: agentCommand, cwd: '/workspace',
  timeoutMs: 240000, detached: true,
});
console.log('OpenCode job', started.command.id);`,
    check: 'The returned command ID is a job handle, not the final result. No Kubernetes exec or provider-admin endpoint is involved.',
  },
  {
    id: 'wait', title: 'Wait for completion and inspect the logs', chapter: 'Wait and inspect', seconds: 20,
    text: 'commands.wait polls the tracked command. Its 260-second timeout is the worker waiting budget, not an extension of the 240-second execution limit or the sandbox TTL. Check the remote exit code, then read logs before terminating the sandbox. A wait timeout is not cancellation; this example goes through finally cleanup.',
    code: `const result = await client.commands.wait(
  sandbox.id, started.command.id, { timeoutMs: 260000 }
);
assert.equal(result.command.exitCode, 0, 'Agent command failed');
const logs = await client.commands.logs(
  sandbox.id, started.command.id
);`,
    check: 'Exit code 0 only establishes process success. The complete example also rejects missing or unfinished tools and completed model steps with nonzero reported cost, then validates files.',
  },
  {
    id: 'tools', title: 'Inspect real work, not an agent promise', chapter: 'Recorded agent tools', seconds: 16,
    text: 'The film shows completed tool calls from the real execution. OpenCode reads the input, writes analyze.py, runs Python and inspects its artifacts. The caller did not supply the analysis program. Raw JSON logs can contain private reasoning or sensitive values; the public film includes reviewed tool names and paths only.',
    code: '',
    check: 'Completed step_finish events must exist and report cost 0. Generated code and tool order may vary on a rerun; the original input and output assertions are stable.',
  },
  {
    id: 'download', title: 'Retrieve files before destroying the runtime', chapter: 'Download the artifacts', seconds: 18,
    text: 'files.download returns an envelope containing contentBase64. Download both generated artifacts and a fresh copy of the input. Decode the JSON bytes in your Node.js worker; this is a file transfer through Harakiri, not a model response parsed as a report.',
    code: `const downloaded = await client.files.download(
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
);`,
    check: 'Missing artifacts, invalid JSON or failed downloads reject the run. Runtime files and logs are not assumed to remain available after termination.',
  },
  {
    id: 'verify', title: 'Make your application the final judge', chapter: 'Independent assertions', seconds: 22,
    text: 'The worker compares the exact report object against expectations calculated from the fixture and checks the original CSV is unchanged. assert.deepEqual also rejects extra fields or string values instead of numbers. The script requires a nonempty summary, but it does not claim to validate every statement in that prose. Only after these checks are report.json and summary.md saved locally.',
    code: `assert.deepEqual(report, {
  paid_orders: 3, revenue_cents: 29600, refunded_orders: 1,
});
assert.equal(
  Buffer.from(original.contentBase64, 'base64').toString('utf8'),
  csv, 'Agent modified input data'
);
const summary = Buffer.from(summaryFile.contentBase64, 'base64')
  .toString('utf8');
assert.ok(summary.trim().length > 0);`,
    check: 'A model success message, a completed process or an attractive summary cannot replace these deterministic checks.',
  },
  {
    id: 'result', title: 'The verified result is now in your worker', chapter: 'Verified output', seconds: 18,
    text: 'In the recorded run the downloaded report contains exactly three paid orders, 29600 revenue cents and one refund. Both report.json and summary.md are saved beside sdk-report.mjs. The report can now feed your own application workflow; downstream publishing is not part of this demonstration.',
    code: '{\n  "paid_orders": 3,\n  "revenue_cents": 29600,\n  "refunded_orders": 1\n}',
    check: 'The input was unchanged and completed model steps reported zero cost in this recording. That is observed evidence, not a permanent pricing or free-model availability guarantee.',
  },
  {
    id: 'cleanup', title: 'Always clean up, including on failure', chapter: 'Cleanup and recovery', seconds: 20,
    text: 'The full example wraps the sandbox work in try/finally. It kills the runtime and waits for terminated on success or failure. A network failure or a killed worker can still prevent cleanup: retain the printed sandbox ID, inspect it and kill it when connectivity returns. TTL is a safety net. Do not enable the internal DEMO_EVIDENCE option for ordinary use because it stores private execution traces.',
    code: `finally {
  await client.killSandbox(sandbox.id);
  const ended = await client.waitForSandbox(sandbox.id, {
    statuses: ['terminated'], timeoutMs: 30000,
  });
  assert.equal(ended.sandbox.status, 'terminated');
  console.log('Cleaned up', sandbox.id);
}`,
    check: 'The real recording independently confirmed termination. Download the complete source to run the workflow; individual film snippets omit surrounding imports and try/finally for readability.',
  },
];

export const sdkDemoTutorial = {
  id: 'sdk-agent-report', title: 'SDK: generate and retrieve a report',
  lede: 'A complete Node.js worker walkthrough: turn a synthetic order export into an agent-written analysis, retrieve the files, assert the result, and terminate the workspace.',
  sections: sdkDemoSteps,
};

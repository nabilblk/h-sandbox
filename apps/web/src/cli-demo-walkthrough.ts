import type { DemoStep } from './demo-walkthrough';

export const cliDemoPrompt = 'Fix invoice.mjs so subtotal is discounted by discountPercent, rounded to integer cents, then shipping is added unchanged. Run node --test invoice.spec.mjs to verify your fix. Do not modify invoice.spec.mjs. Use your tools to edit and run tests, not just describe a fix.';

export const cliDemoSteps: DemoStep[] = [
  {
    id: 'use-case', title: 'Repair an invoice bug without changing the tests', chapter: 'Use case', seconds: 18,
    text: 'A discount is missing from an invoice calculation. Give OpenCode a broken implementation and four existing acceptance tests in a disposable workspace. This demonstrates a developer delegating a small repair, not an agent deciding what correctness means. All inputs are synthetic.', code: '',
    check: 'The deliverable is changed source code. The same original tests must fail before the repair and pass afterward.',
  },
  {
    id: 'boundary', title: 'Your terminal controls a remote workspace', chapter: 'Execution boundary', seconds: 16,
    text: 'The CLI runs on your machine and calls Harakiri. OpenCode, Node and Git execute inside the sandbox. Model inference is external: OpenCode sends task context to the selected provider. Your Harakiri API key stays in your local shell configuration, never in the task files.', code: '',
    check: 'There is no Kubernetes exec, host repository mount, or paid provider key in this recording.',
  },
  {
    id: 'setup', title: 'Install the CLI and choose the runtime', chapter: 'Local prerequisites', seconds: 18,
    text: 'Extract the source archive and open agent-workflows in a POSIX shell. Install Node.js 22+, jq and the published CLI. Set HARAKIRI_API_URL and HARAKIRI_API_KEY privately. login uses that environment key. The organization must have a ready opencode template; ask an administrator to build the included template if absent.',
    code: 'npm install -g @h-sandbox/cli@0.4.0\nharakiri login --api-url "$HARAKIRI_API_URL"\nharakiri template list',
    check: 'The opencode template is ready. Installation is local; OpenCode is already installed in the remote template.',
  },
  {
    id: 'create', title: 'Create and retain the sandbox ID', chapter: 'Create and safety net', seconds: 18,
    text: 'Capture the returned ID and keep it for recovery. A ten-minute TTL bounds runtime lifetime. The EXIT trap attempts cleanup when your shell exits; it cannot guarantee cleanup after lost connectivity or a killed host. The film uses SBX as an alias for the real recorded ID.',
    code: 'SBX=$(harakiri create --template opencode \\\n  --name invoice-repair --ttl 600 | sed -n "/^sbx_/p")\ntest -n "$SBX" || exit 1\ntrap \'harakiri kill "$SBX"\' EXIT\nharakiri inspect "$SBX"',
    check: 'Retain the sandbox ID and confirm running before continuing. TTL is a fallback, not the cleanup step.',
  },
  {
    id: 'upload', title: 'Upload the broken source and original tests', chapter: 'Upload the task', seconds: 18,
    text: 'The archive includes invoice.mjs and invoice.spec.mjs. file-upload transfers them through Harakiri into /workspace. Stage both files in a new Git index to obtain a meaningful implementation diff later; a commit identity is not needed for this comparison.',
    code: 'for file in invoice.mjs invoice.spec.mjs; do\n  harakiri file-upload "$SBX" --from "$file" \\\n    --path "/workspace/$file" --parents\ndone\nharakiri run "$SBX" --cwd /workspace \\\n  --cmd "git init -q && git add invoice.mjs invoice.spec.mjs"',
    check: 'Only source and tests are uploaded. No completed fix is supplied to the agent.',
  },
  {
    id: 'model', title: 'Configure the main and auxiliary free models', chapter: 'Model configuration', seconds: 22,
    text: 'Save the following JSON as opencode.json locally, then upload it to /workspace/opencode.json with file-upload. Check opencode models opencode --refresh through harakiri run first. The recording used mimo-v2.5-free; stop if it is unavailable. Broad tool permissions are for this synthetic disposable example only.',
    code: '{\n  "model": "opencode/mimo-v2.5-free",\n  "small_model": "opencode/mimo-v2.5-free",\n  "enabled_providers": ["opencode"],\n  "share": "disabled", "autoupdate": false,\n  "permission": {"*": "allow"}\n}',
    check: 'Both models are explicit. No paid fallback. Free-provider data policies still apply to the uploaded task.',
  },
  {
    id: 'baseline', title: 'Establish the failure before asking for a fix', chapter: 'Failing baseline', seconds: 20,
    text: 'Upload the configuration and record the test file SHA-256, then execute the original test suite. Save that hash locally for comparison. In CLI 0.4.0, harakiri run does not propagate the remote exit code as its own shell status; inspect the returned output. The tracked command API below exposes an explicit remote exitCode.',
    code: 'harakiri file-upload "$SBX" --from opencode.json \\\n  --path /workspace/opencode.json\nharakiri run "$SBX" --cwd /workspace \\\n  --cmd "sha256sum invoice.spec.mjs"\nharakiri run "$SBX" --cwd /workspace \\\n  --cmd "node --test invoice.spec.mjs"',
    check: 'Recorded baseline: four tests, one pass, three failures. The test SHA-256 must remain unchanged after the repair.',
  },
  {
    id: 'prompt', title: 'Give OpenCode the complete repair contract', chapter: 'Full prompt', seconds: 24,
    text: 'cli-prompt.txt in the archive contains this exact prompt. It specifies calculation order, rounding, immutable tests and actual execution. Read it into PROMPT in your local shell for the next command. The supplied prompt contains no single quotes; do not reuse the simple quoted construction below for arbitrary untrusted prompts.',
    code: cliDemoPrompt,
    check: 'Discount subtotal, round cents, add shipping unchanged. The agent must edit and test, not merely propose a fix.',
  },
  {
    id: 'start', title: 'Start the agent as a tracked command', chapter: 'Run the agent', seconds: 22,
    text: 'opencode run is the remote executable, --format json emits tool events, and --model selects the free provider model. The last argument is the complete prompt. Harakiri command run starts that shell string in /workspace. detached returns a job ID; it does not mean the repair is finished.',
    code: 'MODEL=opencode/mimo-v2.5-free\nPROMPT=$(cat cli-prompt.txt)\nJOB=$(harakiri command run "$SBX" --cwd /workspace \\\n  --cmd "opencode run --format json --model $MODEL \'$PROMPT\'" \\\n  --timeout-ms 240000 --detached --json | jq -r .command.id)\ntest -n "$JOB" && test "$JOB" != null',
    check: 'Retain the command ID. The 240-second limit bounds execution; the next command waits for its result.',
  },
  {
    id: 'wait', title: 'Wait and inspect real tool activity', chapter: 'Wait and logs', seconds: 20,
    text: 'command wait polls the tracked job for up to 260 seconds. A waiting timeout does not cancel execution. Require remote exitCode 0 and inspect tool_use and step_finish events from logs. Raw traces may contain private reasoning or sensitive values; the public film only shows reviewed tool summaries.',
    code: 'harakiri command wait "$SBX" "$JOB" \\\n  --timeout-ms 260000 --json\nharakiri command logs "$SBX" "$JOB" --json',
    check: 'Completed tools and zero-cost model steps must exist. A successful process alone does not establish a correct repair.',
  },
  {
    id: 'tools', title: 'Review the actual agent work', chapter: 'Recorded tool calls', seconds: 16,
    text: 'The recording contains OpenCode reading the source and tests, editing the implementation, and running Node tests. The film replays reviewed facts from that execution. Tool order and implementation details can differ when you reproduce it.', code: '',
    check: 'Real read, edit and bash calls completed. The model did not receive a prewritten replacement implementation.',
  },
  {
    id: 'verify', title: 'Rerun the unchanged acceptance tests', chapter: 'Independent verification', seconds: 22,
    text: 'Execute the original tests yourself after the agent completes. Compare SHA-256 against the saved baseline, then inspect git diff. The capture separately verified the remote exit code and immutable test bytes. Do not accept a green summary if the agent changed the tests.',
    code: 'harakiri run "$SBX" --cwd /workspace \\\n  --cmd "node --test invoice.spec.mjs"\nharakiri run "$SBX" --cwd /workspace \\\n  --cmd "sha256sum invoice.spec.mjs"\nharakiri run "$SBX" --cwd /workspace \\\n  --cmd "git diff -- invoice.mjs"',
    check: 'Four tests pass, zero fail, and the original test hash matches. Review the diff before adopting the code.',
  },
  {
    id: 'result', title: 'The repair passes the original contract', chapter: 'Verified result', seconds: 18,
    text: 'The recorded implementation applies the discount to subtotal, rounds to integer cents, then adds shipping. The caller confirmed all four original tests pass. This is evidence for this fixture, not proof against every possible invoice edge case.', code: '',
    check: 'Independent test run: 4 passed, 0 failed. Test file unchanged. Completed model steps reported zero cost.',
  },
  {
    id: 'cleanup', title: 'Retrieve useful work, then terminate', chapter: 'Cleanup and recovery', seconds: 20,
    text: 'Before killing the runtime, retrieve the repair with harakiri file-download "$SBX" --path /workspace/invoice.mjs --to invoice.fixed.mjs. This optional command preserves the broken local fixture for another run. Kill explicitly and inspect the final state before removing the trap. If your connection fails, retain SBX, reconnect and inspect or kill again. Files and logs are not guaranteed after termination.',
    code: 'harakiri kill "$SBX"\nharakiri inspect "$SBX"\n# Only after terminated is confirmed:\ntrap - EXIT',
    check: 'The recorded sandbox is terminated. Provider failure, timeout or a bad repair still requires cleanup.',
  },
];

export const cliDemoTutorial = {
  id: 'cli-agent-repair', title: 'CLI: repair code with OpenCode',
  lede: 'A complete terminal workflow: create, upload, configure a free agent, prove the failure, run the repair, independently verify and clean up.',
  sections: cliDemoSteps,
};

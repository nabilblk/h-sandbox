# Repair a bug from the CLI

Real execution, edited waiting. CLI output is replayed from recorded text; SDK snippets are source excerpts with educational diagrams. UI footage is recorded in the actual dashboard. No voiceover.

Model: opencode/mimo-v2.5-free. Recorded 2026-09-05T12:40:12.758Z. Free-model availability can change.

## 0s: Repair an invoice bug without changing the tests

The deliverable is changed source code. The same original tests must fail before the repair and pass afterward.

- **A failing calculation:** Discounts are ignored. Four existing tests define correct rounding and shipping behavior.
- **An agent repair:** OpenCode reads the task, edits the implementation and runs the Node test suite.
- **Independent acceptance:** Rerun the original tests. Compare the test hash and inspect the implementation diff.

## 18s: Your terminal controls a remote workspace

There is no Kubernetes exec, host repository mount, or paid provider key in this recording.

- **Your terminal:** Published Harakiri CLI. Holds your API key and sends files and commands through the control plane.
- **Remote sandbox:** OpenCode, Node and Git work in /workspace. No local project mount or Kubernetes exec.
- **External model:** OpenCode calls the explicit free provider. Only synthetic source and tests are used.

## 34s: Install the CLI and choose the runtime

The opencode template is ready. Installation is local; OpenCode is already installed in the remote template.

```text
npm install -g @h-sandbox/cli@0.4.0
harakiri login --api-url "$HARAKIRI_API_URL"
harakiri template list
```

## 52s: Create and retain the sandbox ID

Retain the sandbox ID and confirm running before continuing. TTL is a fallback, not the cleanup step.

```text
SBX=$(harakiri create --template opencode \
  --name invoice-repair --ttl 600 | sed -n "/^sbx_/p")
test -n "$SBX" || exit 1
trap 'harakiri kill "$SBX"' EXIT
harakiri inspect "$SBX"
```

## 70s: Upload the broken source and original tests

Only source and tests are uploaded. No completed fix is supplied to the agent.

```text
for file in invoice.mjs invoice.spec.mjs; do
  harakiri file-upload "$SBX" --from "$file" \
    --path "/workspace/$file" --parents
done
harakiri run "$SBX" --cwd /workspace \
  --cmd "git init -q && git add invoice.mjs invoice.spec.mjs"
```

## 88s: Configure the main and auxiliary free models

Both models are explicit. No paid fallback. Free-provider data policies still apply to the uploaded task.

```text
{
  "model": "opencode/mimo-v2.5-free",
  "small_model": "opencode/mimo-v2.5-free",
  "enabled_providers": ["opencode"],
  "share": "disabled", "autoupdate": false,
  "permission": {"*": "allow"}
}
```

## 110s: Establish the failure before asking for a fix

Recorded baseline: four tests, one pass, three failures. The test SHA-256 must remain unchanged after the repair.

```text
$ harakiri run "$SBX" --cwd /workspace --cmd "node --test invoice.spec.mjs"
not ok 1 - applies discount before shipping
not ok 2 - rounds discounted cents once
ok 3 - handles no discount
not ok 4 - a full discount still charges shipping
# tests 4
# pass 1
# fail 3
```

## 130s: Give OpenCode the complete repair contract

Discount subtotal, round cents, add shipping unchanged. The agent must edit and test, not merely propose a fix.

```text
Fix invoice.mjs so subtotal is discounted by discountPercent, rounded to integer cents, then shipping is added unchanged. Run node --test invoice.spec.mjs to verify your fix. Do not modify invoice.spec.mjs. Use your tools to edit and run tests, not just describe a fix.
```

## 154s: Start the agent as a tracked command

Retain the command ID. The 240-second limit bounds execution; the next command waits for its result.

```text
MODEL=opencode/mimo-v2.5-free
PROMPT=$(cat cli-prompt.txt)
JOB=$(harakiri command run "$SBX" --cwd /workspace \
  --cmd "opencode run --format json --model $MODEL '$PROMPT'" \
  --timeout-ms 240000 --detached --json | jq -r .command.id)
test -n "$JOB" && test "$JOB" != null
```

## 176s: Wait and inspect real tool activity

Completed tools and zero-cost model steps must exist. A successful process alone does not establish a correct repair.

```text
harakiri command wait "$SBX" "$JOB" \
  --timeout-ms 260000 --json
harakiri command logs "$SBX" "$JOB" --json
```

## 196s: Review the actual agent work

Real read, edit and bash calls completed. The model did not receive a prewritten replacement implementation.

```text
read     /workspace/invoice.mjs
read     /workspace/invoice.spec.mjs
edit     /workspace/invoice.mjs
bash     node --test invoice.spec.mjs
```

## 212s: Rerun the unchanged acceptance tests

Four tests pass, zero fail, and the original test hash matches. Review the diff before adopting the code.

```text
$ harakiri run "$SBX" --cwd /workspace --cmd "node --test invoice.spec.mjs"
ok 1 - applies discount before shipping
ok 2 - rounds discounted cents once
ok 3 - handles no discount
ok 4 - a full discount still charges shipping
# tests 4
# pass 4
# fail 0
```

## 234s: The repair passes the original contract

Independent test run: 4 passed, 0 failed. Test file unchanged. Completed model steps reported zero cost.

```text
Before       1 passed / 3 failed
After        4 passed / 0 failed
Test SHA     unchanged
Model steps  zero reported cost
```

## 252s: Retrieve useful work, then terminate

The recorded sandbox is terminated. Provider failure, timeout or a bad repair still requires cleanup.

```text
harakiri kill "$SBX"
harakiri inspect "$SBX"
# Only after terminated is confirmed:
trap - EXIT
```

# Hands-on Tutorials

These tutorials exercise Harakiri as an application developer would use it.
They create real sandboxes, verify an observable result, and clean up every
resource they create.

## Upcoming: Persistent Agent Projects

The [persistent workspace tutorial](persistent-workspaces.md) and
[runnable acceptance example](../examples/sdk-persistent-workspace/index.mjs)
write a checkpoint, replace the sandbox, read the same file, disconnect a live
command viewer and resume its output without executing the job twice. They
require unreleased matching source builds and operator-enabled storage, not npm
0.4.0. Cleanup terminates sandboxes and archives the workspace, but does not
physically erase retained storage.

## Before You Start

You need:

- Node.js 20 or newer
- `curl` and `jq`
- a Harakiri API URL
- an API key created from the dashboard

Install and configure the CLI:

```bash
npm install -g @h-sandbox/cli

export HARAKIRI_API_URL=https://sb-api.harakiri.io
export HARAKIRI_API_KEY=hk_live_...

harakiri login \
  --api-url "$HARAKIRI_API_URL" \
  --api-key "$HARAKIRI_API_KEY"
harakiri capabilities
```

The final command reports the active runtime provider and its capabilities.
Run it before persistence or network-policy tutorials so an unsupported
provider produces a clear preflight result instead of a partial workflow.

> Never commit `HARAKIRI_API_KEY`. Use a secret manager in CI and server-side
> applications. API keys are not browser credentials.

## Tutorial 1: Run a Data Job and Download Its Artifact

**Scenario:** upload a small dataset and a Python program, run the program in a
disposable workspace, then download and validate the result.

Create local input files:

```bash
WORK_DIR="$(mktemp -d)"

cat >"$WORK_DIR/orders.csv" <<'CSV'
item,amount
api,21
worker,34
preview,13
CSV

cat >"$WORK_DIR/job.py" <<'PY'
import csv

with open("orders.csv", newline="") as source:
    rows = list(csv.DictReader(source))

total = sum(int(row["amount"]) for row in rows)
with open("summary.txt", "w") as output:
    output.write(f"orders={len(rows)} total={total}\n")

print(f"processed {len(rows)} orders")
PY
```

Create the sandbox and install a cleanup trap before doing any work:

```bash
SBX_ID="$(harakiri create \
  --template python-3.12-data \
  --name tutorial-data-job \
  --ttl 600 | sed -n '/^sbx_/p')"

cleanup() {
  harakiri kill "$SBX_ID" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT
```

Upload, run, and download:

```bash
harakiri file-upload "$SBX_ID" \
  --from "$WORK_DIR/orders.csv" \
  --path /workspace/orders.csv \
  --parents

harakiri file-upload "$SBX_ID" \
  --from "$WORK_DIR/job.py" \
  --path /workspace/job.py \
  --parents

harakiri run "$SBX_ID" \
  --cwd /workspace \
  --cmd "python job.py"

harakiri file-download "$SBX_ID" \
  --path /workspace/summary.txt \
  --to "$WORK_DIR/summary.txt"

grep -qx "orders=3 total=68" "$WORK_DIR/summary.txt"
echo "PASS: artifact content and checksum verified"
```

The command run prints `processed 3 orders`. The CLI verifies the downloaded
artifact checksum, and `grep` verifies its business result. Leave the shell or
run `cleanup` to terminate the sandbox.

## Tutorial 2: Publish a Token-Protected Preview

**Scenario:** start a long-running HTTP process, expose its port, prove that an
anonymous request is rejected, and then access it with the one-time route
token.

```bash
SBX_ID="$(harakiri create \
  --template python-3.12 \
  --name tutorial-private-preview \
  --ttl 600 | sed -n '/^sbx_/p')"

cleanup() {
  harakiri kill "$SBX_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

harakiri file-write "$SBX_ID" \
  --path /workspace/index.html \
  --content '<h1>Harakiri preview is ready</h1>' \
  --parents

COMMAND_JSON="$(harakiri command run "$SBX_ID" \
  --cmd "python -m http.server 5173 --bind 0.0.0.0" \
  --cwd /workspace \
  --detached \
  --json)"
COMMAND_ID="$(jq -r '.command.id' <<<"$COMMAND_JSON")"

harakiri command wait "$SBX_ID" "$COMMAND_ID" \
  --status running \
  --timeout-ms 30000

ROUTE_JSON="$(harakiri expose "$SBX_ID" \
  --port 5173 \
  --access token \
  --label tutorial-preview \
  --wait \
  --wait-path / \
  --json)"

ROUTE_URL="$(jq -r '.route.url' <<<"$ROUTE_JSON")"
HEADER_NAME="$(jq -r '.accessHeaderName' <<<"$ROUTE_JSON")"
ROUTE_TOKEN="$(jq -r '.accessToken' <<<"$ROUTE_JSON")"
```

Verify both sides of route authentication:

```bash
ANON_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "$ROUTE_URL")"
test "$ANON_STATUS" = "401"

curl -fsS \
  -H "$HEADER_NAME: $ROUTE_TOKEN" \
  "$ROUTE_URL" | grep -q "Harakiri preview is ready"

echo "PASS: anonymous=401 authenticated=200"
```

The route token is returned only when the route is created. Treat it as a
secret. A production integration should keep it server-side or exchange it for
an application-specific access mechanism.

## Tutorial 3: Restrict Outbound Network Access

**Scenario:** let a Python job reach package infrastructure and GitHub while
proving that an unrelated public host remains blocked.

Check that `egressPolicy` is supported in `harakiri capabilities`, then run:

```bash
SBX_ID="$(harakiri create \
  --template python-3.12-data \
  --name tutorial-restricted-egress \
  --ttl 600 \
  --egress restricted \
  --egress-preset python-package-install | sed -n '/^sbx_/p')"

cleanup() {
  harakiri kill "$SBX_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

PYPI_RESULT="$(harakiri egress test "$SBX_ID" https://pypi.org/simple 2>/dev/null | cut -f1)"
GOOGLE_RESULT="$(harakiri egress test "$SBX_ID" https://www.google.com 2>/dev/null | cut -f1)"

test "$PYPI_RESULT" = "ok"
test "$GOOGLE_RESULT" = "blocked"

harakiri egress allow "$SBX_ID" api.github.com
GITHUB_RESULT="$(harakiri egress test "$SBX_ID" https://api.github.com 2>/dev/null | cut -f1)"
test "$GITHUB_RESULT" = "ok"

harakiri egress "$SBX_ID"
echo "PASS: package and Git hosts allowed; unrelated host blocked"
```

Restricted mode is deny-by-default. Presets compress common domain sets, while
`egress allow` adds an explicit hostname when a workload needs one more
destination.

## Tutorial 4: Create a Git Workspace

**Scenario:** prepare a portable Ubuntu workspace, clone a public repository,
create a local branch, modify a file, and commit without granting the sandbox
any push credential.

```bash
SBX_ID="$(harakiri create \
  --template ubuntu-24.04 \
  --name tutorial-git-workspace \
  --ttl 900 | sed -n '/^sbx_/p')"

cleanup() {
  harakiri kill "$SBX_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

harakiri run "$SBX_ID" \
  --cmd 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates git && if [ -n "${SSL_CERT_FILE:-}" ]; then git config --global http.sslCAInfo "$SSL_CERT_FILE"; fi'
harakiri git clone "$SBX_ID" \
  https://github.com/octocat/Hello-World.git \
  --path /workspace/project \
  --depth 1
harakiri git status "$SBX_ID" --cwd /workspace/project
harakiri git branch "$SBX_ID" tutorial/change --cwd /workspace/project

harakiri file-write "$SBX_ID" \
  --path /workspace/project/harakiri.txt \
  --content "created in a disposable workspace" \
  --parents

harakiri git add "$SBX_ID" harakiri.txt --cwd /workspace/project
harakiri git commit "$SBX_ID" \
  --cwd /workspace/project \
  --message "Add Harakiri workspace marker" \
  --author-name "Harakiri Tutorial" \
  --author-email "tutorial@example.com"

harakiri git status "$SBX_ID" --cwd /workspace/project | grep -q clean
echo "PASS: repository cloned and local commit created"
```

The tutorial installs Git so it works with the default portable catalog. For
real workloads, use a custom template such as `open-agents-dev` with Git and
other agent tools already baked into the image. The bootstrap also makes Git
honor a runtime-provided `SSL_CERT_FILE`, which is required when egress uses a
trusted interception certificate. Runtime package installation adds latency
and weakens reproducibility.

For a private HTTPS repository, pass a short-lived token with
`--git-token-env GITHUB_TOKEN`. Harakiri removes the credential from the remote
URL after clone unless credential persistence is explicitly requested.

## Tutorial 5: Pause, Snapshot, and Restore State

**Scenario:** preserve a workspace across pause/resume, capture an immutable
snapshot, and create a second sandbox from it.

First confirm that `lifecyclePause`, `lifecycleResume`, `lifecycleSnapshot`,
and `createFromSnapshot` are supported:

```bash
harakiri capabilities | grep -E \
  'lifecyclePause|lifecycleResume|lifecycleSnapshot|createFromSnapshot'
```

Then run the persistence workflow:

```bash
SOURCE_ID=""
RESTORED_ID=""
SNAPSHOT_ID=""

cleanup() {
  test -z "$RESTORED_ID" || harakiri kill "$RESTORED_ID" >/dev/null 2>&1 || true
  test -z "$SOURCE_ID" || harakiri kill "$SOURCE_ID" >/dev/null 2>&1 || true
  test -z "$SNAPSHOT_ID" || harakiri snapshots delete "$SNAPSHOT_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

SOURCE_ID="$(harakiri create \
  --template python-3.12 \
  --name tutorial-snapshot-source \
  --ttl 900 | sed -n '/^sbx_/p')"

harakiri file-write "$SOURCE_ID" \
  --path /workspace/checkpoint.txt \
  --content "checkpoint-ready" \
  --parents

harakiri pause "$SOURCE_ID"
harakiri resume "$SOURCE_ID"
test "$(harakiri file-read "$SOURCE_ID" --path /workspace/checkpoint.txt)" = "checkpoint-ready"

SNAPSHOT_JSON="$(harakiri snapshot "$SOURCE_ID" \
  --name tutorial-checkpoint \
  --wait \
  --wait-timeout-ms 120000 \
  --json)"
SNAPSHOT_ID="$(jq -r '.snapshot.id' <<<"$SNAPSHOT_JSON")"

RESTORED_ID="$(harakiri create \
  --snapshot "$SNAPSHOT_ID" \
  --name tutorial-snapshot-restored \
  --ttl 600 | sed -n '/^sbx_/p')"

test "$(harakiri file-read "$RESTORED_ID" --path /workspace/checkpoint.txt)" = "checkpoint-ready"
echo "PASS: state survived resume and snapshot restore"
```

Delete snapshots when their retention purpose ends. Killing a sandbox does not
implicitly delete snapshots created from it.

## Tutorial 6: Integrate Harakiri Into a Worker

**Scenario:** use the public SDK from application code with idempotent create,
bounded waits, explicit error handling, and guaranteed cleanup.

```bash
mkdir harakiri-worker && cd harakiri-worker
npm init -y
npm install @h-sandbox/sdk
```

Create `worker.mjs`:

```js
import { randomUUID } from "node:crypto";
import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";

const client = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandboxId;
const jobId = process.env.JOB_ID ?? randomUUID();

try {
  const created = await client.createSandbox({
    template: "python-3.12-data",
    name: "tutorial-sdk-worker",
    ttlSeconds: 600,
    wait: false,
    idempotencyKey: `tutorial-job-${jobId}`
  });
  sandboxId = created.sandbox.id;
  await client.waitForSandbox(sandboxId, { timeoutMs: 90_000 });

  await client.writeSandboxFile(sandboxId, {
    path: "/workspace/task.py",
    content: "print('sdk-worker-ready')\n",
    createParents: true
  });

  const run = await client.runSandbox(sandboxId, {
    command: "python /workspace/task.py",
    timeoutMs: 30_000
  });

  if (run.result.exitCode !== 0) throw new Error(run.result.stderr);
  if (!run.result.stdout.includes("sdk-worker-ready")) {
    throw new Error("sandbox returned an unexpected result");
  }

  console.log(`PASS: ${sandboxId} completed the worker task`);
} catch (error) {
  if (error instanceof HarakiriApiError) {
    console.error({ code: error.code, retryable: error.retryable });
  }
  throw error;
} finally {
  if (sandboxId) await client.killSandbox(sandboxId).catch(() => undefined);
}
```

Run it:

```bash
JOB_ID="$(date +%s)" node worker.mjs
```

The `finally` block is the application-level cleanup guarantee. TTL remains the
platform safety net when a process crashes before cleanup runs. The same code
is available as `examples/sdk-worker-tutorial/index.mjs` in the repository.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `401 Unauthorized` | Confirm `HARAKIRI_API_URL`, rotate the API key if needed, and rerun `harakiri login`. |
| Sandbox remains pending | Run `harakiri status <id> --json` and inspect the operation error and provider capability state. |
| Route wait times out | Ensure the process listens on `0.0.0.0`, not `127.0.0.1`, and that the exposed port matches. |
| Egress provider unavailable | Check `harakiri capabilities` and ask the operator whether runtime egress enforcement is enabled. |
| Git clone cannot connect | Add the `git-hosting` egress preset or explicitly allow the repository host. |
| Snapshot is unsupported | The active runtime or registry is missing persistence support; do not emulate it with Kubernetes access. |

Continue with the [CLI reference](cli.md), [SDK guide](sdk.md),
[lifecycle guide](lifecycle.md), [route guide](routes.md),
[outbound access guide](egress-control.md), and
[Credential Vault cookbook](credential-vault-cookbook.md).

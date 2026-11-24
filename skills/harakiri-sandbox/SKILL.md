---
name: harakiri-sandbox
description: Run code, tests, builds and dev servers in isolated Harakiri sandboxes from a coding agent, through the `harakiri` CLI. Use when the user asks to run something in a sandbox or isolated environment, try untrusted code safely, test a branch in a clean machine, preview a web app from a sandbox, or mentions Harakiri sandboxes. Covers creating sandboxes, moving files in and out, background processes, token-protected preview routes, restricted network access, credentials and cleanup. Not for installing Harakiri (use harakiri-deploy).
---

# Use Harakiri sandboxes

A Harakiri sandbox is a disposable, isolated runtime on the user's own Harakiri
installation. Use it to run work that should not touch the user's machine.
Typical work: untrusted code, dependency installs, test suites, agent tasks
and dev servers to preview.

## Rules

1. **Only touch what you created.** Keep a list of every sandbox, command and
   route ID you create in this session. Read, change and terminate only those,
   unless the user names another ID.
   - Never run `harakiri kill --idle`. It terminates every idle sandbox in the
     organization.
2. **Always pass the sandbox ID explicitly.** `harakiri run` with no ID reuses
   the last saved sandbox and **terminates it afterwards**.
3. **Clean up.** Terminate your sandboxes and remove your routes when the task
   ends, including after failures. If cleanup is uncertain, tell the user the
   IDs.
4. **Keep secrets out.**
   - Never ask the user to paste an API key into the chat.
   - Never put real secrets in `--env`, `--run-env`, command text or uploaded
     files.
   - Exclude `.env`, key files and credential stores from uploads.
   - Use the Credential Vault for credentials (see below).
5. **Respect the platform.** If an operation returns
   `runtime_feature_unavailable` or `organization_capacity_exceeded`, report it.
   Do not retry in a loop, call the provider directly or work around policy.
6. **Parse JSON, not prose.** Use `--json` where it exists. Human output is for
   reading.

## Setup check

```bash
harakiri --version
harakiri doctor        # checks URL, key and access; never prints the key
```

If `harakiri` is missing, ask which server version the user runs. Then install
the matching CLI. Release candidates use npm `next`; `latest` is an older
stable release that lacks newer commands.

```bash
npm view @h-sandbox/cli dist-tags
npm install -g @h-sandbox/cli@<server-version>
```

If `doctor` fails on configuration, the user sets these in **their own**
shell:

- `HARAKIRI_API_URL`: HTTPS, or HTTP on loopback only.
- `HARAKIRI_API_KEY`: a scoped, expiring key from the dashboard.

Do not run `harakiri login --api-key ...` yourself, because it records the key
in shell history.

Before using advanced features, check what this installation supports:

```bash
harakiri capabilities
harakiri template list
```

Restricted profiles, such as OpenShift, can disable snapshots, workspaces,
egress policy and the Vault.

## Core loop

```bash
# 1. Create. The ID is the stdout line that does not start with "-> ".
#    Add --git <url> --git-path /workspace/project to clone a repository at creation.
SBX=$(harakiri create --template python-3.12-data --name "agent-$TASK" --ttl 900 | grep -v '^-> ' | tail -n1)

# 2. Or upload a local tree, without secrets or build output:
tar -czf "$TMPDIR/src.tgz" --exclude .git --exclude node_modules --exclude '.env*' .
harakiri file-upload "$SBX" --path /workspace/src.tgz --from "$TMPDIR/src.tgz" --parents
harakiri run "$SBX" --cmd "mkdir -p /workspace/project && tar -xzf /workspace/src.tgz -C /workspace/project"

# 3. Run. The exit code is the command's own.
harakiri run "$SBX" --cwd /workspace/project --timeout-ms 600000 --cmd "pip install -r requirements.txt && pytest -q"

# 4. Get results out. Download verifies the checksum.
harakiri file-download "$SBX" --path /workspace/project/report.xml --to ./report.xml

# 5. Terminate, then confirm.
harakiri kill "$SBX"
harakiri status "$SBX" --json
```

Notes:

- `--ttl` is an **idle** timeout in seconds. Use `harakiri renew "$SBX"` for
  long sessions instead of setting a huge TTL.
- Templates are installation-specific. Pick from `harakiri template list`.
  Catalog examples include `base-linux`, `python-3.12-data`, `node-20-app`,
  `browser-chromium` and `opencode`.
- Commands run without a TTY. Use non-interactive flags such as `-y` and
  `--no-input`.
- For several dependent steps in one shell (`cd`, exported variables), use a
  session: `harakiri command session create "$SBX" --cwd /workspace/project`,
  then `command session run`, then `command session delete`.

## Long-running processes and previews

```bash
CMD=$(harakiri process run "$SBX" --cwd /workspace/project \
  --cmd "npm run dev -- --host 0.0.0.0 --port 5173" --detached --json | jq -r .command.id)
harakiri command wait "$SBX" "$CMD" --status running --timeout-ms 60000
harakiri command tail "$SBX" "$CMD" --lines 50

harakiri expose "$SBX" --port 5173 --access token --wait --wait-path / --json
```

- The server must listen on `0.0.0.0` inside the sandbox.
- **Always pass `--access token`.** The default is `public`.
- The route token is printed **once**. Give the user the URL and tell them the
  token is a secret. Do not write it into files, commits or issues.
- When finished, run `harakiri unexpose "$SBX" --port 5173` and
  `harakiri command kill "$SBX" "$CMD"`.

`harakiri command follow "$SBX" "$CMD"` streams output. Ctrl-C stops watching
but does not stop the process.

## Untrusted code: restrict the network

```bash
harakiri create --template python-3.12-data --egress blocked
harakiri create --template python-3.12-data --egress restricted --egress-preset python-package-install
harakiri egress allow "$SBX" api.github.com
harakiri egress test "$SBX" https://pypi.org/simple
```

Prefer `blocked`, or `restricted` with the smallest allow list, when running
code you have not reviewed. `harakiri egress "$SBX"` shows the current policy.

## Credentials

When a task needs a real credential, such as a model API key or a private API,
use the Credential Vault. The runtime's egress sidecar injects the credential
into outbound requests, so the sandbox process never receives the real value.
The value comes from the user's environment, not from you:

```bash
harakiri vault presets
harakiri create --template open-agents-dev --credential 'preset=openai,from-env=OPENAI_API_KEY'
harakiri vault attach "$SBX" --preset openai --from-env OPENAI_API_KEY
```

`--prompt` needs an interactive TTY. In automation, use `--from-env` or
`--from-stdin`. Create-time credentials cannot be combined with `--no-wait`.

## Failures and uncertain outcomes

- **The outcome of a create is unknown.** This happens after a timeout or a
  network error. Do not create again blindly. Keep the sandbox ID or the
  `--idempotency-key` that was printed on stderr. Check with `harakiri list` or
  `harakiri status <id> --json`, or retry with the **same** idempotency key.
- **`organization_capacity_exceeded`.** Stop or terminate your own sandboxes,
  then check `harakiri capacity --json`. If you hold nothing, ask the user.
- **A sandbox is not ready.** Run `harakiri status "$SBX" --check --json` and
  `harakiri doctor "$SBX"`.
- **A command hangs.** Run `harakiri command status "$SBX" "$CMD" --json`, then
  `harakiri command kill`.
- Errors carry stable codes. The installation's `docs/errors-troubleshooting.md`
  explains them.

## More

- Every installation serves its own version-matched docs at
  `<web-origin>/llms.txt` and `<web-origin>/docs/<page>.md`. Useful pages:
  `quickstart`, `cli-reference`, `sandbox-processes`, `routes`,
  `outbound-access`, `credential-vault`, `workspaces`. `harakiri <command>
  --help` is authoritative for flags.
- **Persistent workspaces** keep files across sandboxes. They require operator
  opt-in. Commands start with `harakiri workspace`; check `capabilities` first.
- **Calling Harakiri from the user's application code.** Use the TypeScript
  SDK (`@h-sandbox/sdk`) or the Python SDK at the server's version. See the
  installation's `typescript-sdk` and `python-sdk` pages. Apply the same rules:
  explicit IDs, bounded timeouts, owned cleanup.

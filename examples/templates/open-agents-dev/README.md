# Open Agents Dev Template

This template is a Harakiri/OpenSandbox `open-agents-dev` runtime. It builds a
normal OCI image that OpenSandbox can pull and run, then Harakiri stores it as
an immutable template version.

Runtime surface:

- `bun`, `node`, `npm`, `pnpm`, and `yarn`
- `agent-browser` and Chromium headless dependencies
- `code-server`
- `git`, `jq`, `rg`, Python, and common Linux tools
- writable `/workspace`
- default ports `3000`, `5173`, `4321`, and `8000`

## Build

Build it through Harakiri from the repository root:

```bash
harakiri template build --name open-agents-dev examples/templates/open-agents-dev
```

The CLI reads `harakiri.toml` in this directory, so `--dockerfile`, CPU, memory,
workdir, visibility, aliases, and default ports do not need to be repeated on
the command line. Passing `--name open-agents-dev` makes the build command
explicit for scripts and keeps it aligned with the template shown in the
dashboard docs. The build command follows logs by default and prints the
resulting template version ID, image digest, duration, and next create command.
Use `--no-wait` if you only want to enqueue the build and inspect it later with
`harakiri template builds` and `harakiri template logs`.

## Run And Smoke Test

```bash
harakiri create --template open-agents-dev --name open-agents-pilot
harakiri run sbx_... --cmd "harakiri-open-agents-smoke"
```

The smoke script verifies the expected command-line tools, checks that
`/workspace` is writable, and runs Chromium in headless mode.

## Expose A Dev Server

Start a process inside the sandbox on `0.0.0.0`, then expose the port:

```bash
harakiri run sbx_... --cmd "nohup node -e \"require('http').createServer((req,res)=>res.end('ok')).listen(3000,'0.0.0.0')\" >/tmp/app.log 2>&1 &"
harakiri expose sbx_... --port 3000
```

Harakiri returns a public route such as
`https://<opensandbox-id>-3000.harakiri.io`.

## Prototype Notes

OpenSandbox currently presents `/workspace` as root-owned in the k0s runtime.
This pilot image runs as root so the writable workspace contract works until
Harakiri/OpenSandbox can pass workdir volume ownership through the runtime
adapter.

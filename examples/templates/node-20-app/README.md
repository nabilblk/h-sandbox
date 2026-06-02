# Node 20 App Template

Node runtime for web apps, API servers, and frontend dev servers that need a
stable Harakiri preview route.

Runtime surface:

- Node 20, `npm`, `pnpm`, and `yarn`.
- `git`, `jq`, `rg`, `python3`, and compiler tools for native npm packages.
- Writable `/workspace`.
- Default ports `3000`, `5173`, and `8000`.

## Build

```bash
harakiri template build --name node-20-app examples/templates/node-20-app
```

## Smoke Test

```bash
harakiri template smoke node-20-app
```

The smoke command checks package managers, writes to `/workspace`, and executes
a small Node program.

## Use

```bash
harakiri create --template node-20-app --name node-runner
harakiri command run sbx_... --cmd "node -e \"require('http').createServer((_, res) => res.end('ok')).listen(3000, '0.0.0.0')\"" --detached
harakiri expose sbx_... --port 3000
```

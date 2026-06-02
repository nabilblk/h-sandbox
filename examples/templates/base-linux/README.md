# Base Linux Template

Small Ubuntu-based Harakiri runtime for shell tools, package bootstrap, and
general agent setup work. It intentionally stays close to a normal Linux image
so it is easy to extend.

Runtime surface:

- `bash`, `curl`, `git`, `jq`, `rg`, `python3`, and common archive tools.
- Writable `/workspace`.
- Default port `8000` for simple HTTP previews.

## Build

```bash
harakiri template build --name base-linux examples/templates/base-linux
```

## Smoke Test

```bash
harakiri template smoke base-linux
```

The smoke command verifies the required tools and confirms `/workspace` is
writable.

## Use

```bash
harakiri create --template base-linux --name linux-runner
harakiri run sbx_... --cmd "python3 -m http.server 8000 --bind 0.0.0.0" --timeout-ms 1000
harakiri expose sbx_... --port 8000
```

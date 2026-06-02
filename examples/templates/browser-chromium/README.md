# Browser Chromium Template

Headless Chromium runtime for browser automation, scraping, screenshotting, and
web-agent tasks that do not need the heavier Open Agents toolchain.

Runtime surface:

- Node 20, `npm`, and `pnpm`.
- Debian Chromium with common headless browser dependencies.
- `git`, `jq`, `rg`, and Python.
- Writable `/workspace`.
- Default ports `3000`, `5173`, and `9222`.

## Build

```bash
harakiri template build --name browser-chromium examples/templates/browser-chromium
```

## Smoke Test

```bash
harakiri template smoke browser-chromium
```

The smoke command launches Chromium headlessly against a data URL, checks the
rendered DOM, and validates `/workspace` writes.

## Use

```bash
harakiri create --template browser-chromium --name browser-runner
harakiri run sbx_... --cmd "chromium --headless --no-sandbox --disable-gpu --dump-dom https://example.com"
```

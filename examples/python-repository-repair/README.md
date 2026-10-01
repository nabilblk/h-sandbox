# Independently Verified Repository Repair

Prepare [model and sandbox access](../../docs/integrations/deepagents-python.md).
Run from the repository root:

```sh
uv run --project python examples/python-repository-repair/repair.py
```

The fixture has four tests, two deliberately failing. The real agent inspects and
repairs `totals.py` through sandbox tools. The application compares the original
test bytes, reruns those tests itself, retrieves the patched file to
`repair-output/totals.py` and confirms owned cleanup. The printed receipt contains
hashes and counters, not prompts, credentials or raw tool output. Test success is
bounded evidence for this fixture, not a security audit of arbitrary agent code.

The model runs in the application environment. Harakiri does not supply a free
model, install one silently or forward host credentials into the runtime.

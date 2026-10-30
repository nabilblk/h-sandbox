# Deep Agents on Harakiri

An optional backend for the real Python `deepagents` framework. Developer
preview `0.1.0rc2` targets Deep Agents `0.7.21` and Python SDK `0.1.0rc2`
exactly, on Python 3.11 or newer. See the
[release record](https://github.com/nabilblk/h-sandbox/blob/main/docs/release-notes/0.5.0-rc.14.md)
for publication status, exact artifacts and native qualification evidence.

Version-pinned PyPI installation, including the exact SDK and framework
dependencies:

```sh
python -m pip install "h-sandbox-deepagents==0.1.0rc2"
```

```python
from deepagents import create_deep_agent
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(template="your-installed-template") as sandbox:
        backend = HarakiriSandboxBackend(sandbox)
        agent = create_deep_agent(model=model, backend=backend)
        result = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
```

Configure `model` and `prompt` in your application; complete examples live in
`examples/python-first-task`. The model and agent loop stay in the application.
The sandbox runs shell and file tools. Neither model nor API credentials are
forwarded into it. A backend always borrows the supplied sandbox.

Use `AsyncHarakiriSandboxBackend` with `AsyncHarakiriClient` and `agent.ainvoke()`
for native async I/O. Use a borrowed sandbox, not a disposable `task` context,
when the graph pauses for human approval. Checkpoints do not extend runtime TTL.

The [complete integration guide](https://github.com/nabilblk/h-sandbox/blob/main/docs/integrations/deepagents-python.md)
covers model setup, installation, template utilities, partial transfers,
truncation, observed command recovery and current qualification status. Standard
output is bounded to 64 KiB by default; abnormal termination remains visible to
the actual framework tools. No distributed exactly-once recovery is claimed.

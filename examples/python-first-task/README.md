# First Python Agent

Use [the Python integration guide](../../docs/integrations/deepagents-python.md)
for exact PyPI installation, model setup, template utilities and credentials.

| Program | Boundary |
| --- | --- |
| `first_model.py` | Application-owned model configuration |
| `first_local.py` | Real Deep Agents with local shell tools; not isolated |
| `first_sandbox.py` | Same prompt and graph, owned disposable Harakiri sandbox |
| `first_existing.py` | Borrow an application-owned sandbox |
| `first_async.py` | Native async tools and `agent.ainvoke()` |

With the published packages installed in an activated environment, run
`python examples/python-first-task/first_sandbox.py` from the repository root.
The [public guide](https://sb.harakiri.io/#docs/deepagents-python) also offers
standalone downloads of these programs, so a checkout is optional.
Contributors testing source instead use
`uv run --project python examples/python-first-task/first_sandbox.py`.
Printing the reply does not establish cleanup success; successful context exit does.
Do not run untrusted local agent tools on a workstation with ambient secrets.

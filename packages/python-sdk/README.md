# Harakiri Python SDK

Typed synchronous and asynchronous clients for the Harakiri sandbox control plane.
Development preview: public PyPI publication and public-artifact qualification
are pending. The qualification record distinguishes source-candidate evidence.

The SDK talks only to the Harakiri API. It does not require Node, Kubernetes
credentials, a runtime-provider SDK or an agent framework.

```python
from harakiri import HarakiriClient

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(template="your-installed-template") as sandbox:
        result = sandbox.run("printf 'hello\\n'", check=True)
        print(result.stdout)
```

Set `HARAKIRI_API_URL` and `HARAKIRI_API_KEY` privately. Closing the client closes
connections, not sandboxes. The explicit `task` context owns a newly created
sandbox and confirms termination and capacity release on exit. `connect` borrows
an existing sandbox and never deletes it automatically.

See the [Python guide](https://github.com/nabilblk/h-sandbox/blob/main/docs/python-sdk.md)
for the supported surface, source installation, request deadlines, partial outcomes
and release qualification status. For asyncio, use `AsyncHarakiriClient`, `async with`
and awaited resource methods. No event-loop bridge or model dependency is required
by the asynchronous API. Python 3.11 is the minimum.

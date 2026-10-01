# Harakiri Python SDK

Typed synchronous and asynchronous clients for the Harakiri sandbox control plane.
Development preview: this source is not yet published or runtime-qualified.

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

See the repository Python guide for the supported surface, development commands,
request deadlines, partial outcomes and release qualification status.

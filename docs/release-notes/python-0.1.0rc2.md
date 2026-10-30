# Python 0.1.0rc2: Protected Sandbox Services

October 30, 2026. Developer preview for Python 3.11+, not a stable promotion.

## Delivery Status

The SDK and adapter archives are published on TestPyPI and production PyPI.
Public-file hashes and all eight publisher attestations are verified. TestPyPI's
and production PyPI's post-publication native qualifications each passed all 13
gates, runner-process cleanup and private-material removal. The
[core delivery record](0.5.0-rc.14-delivery.md) tracks the coordinated release, and
the [TestPyPI receipt](evidence/python-testpypi-2026-10-30.json) and
[production receipt](evidence/python-pypi-2026-10-30.json) retain exact archives
and qualification evidence. Release runs
[41039245672](https://github.com/nabilblk/h-sandbox/actions/runs/41039245672) and
[41046454958](https://github.com/nabilblk/h-sandbox/actions/runs/41046454958)
are complete. Verification-only reruns were required for initial metadata 404s;
no accepted archive was overwritten or reuploaded.

Install in a Python 3.11+ virtual environment:

```sh
python -m pip install "h-sandbox==0.1.0rc2"
# Optional framework integration, including the exact SDK and framework dependency.
python -m pip install "h-sandbox-deepagents==0.1.0rc2"
```

Public projects: [SDK](https://pypi.org/project/h-sandbox/0.1.0rc2/) and
[Deep Agents adapter](https://pypi.org/project/h-sandbox-deepagents/0.1.0rc2/).
Fresh name-based production installs with `pip` and `uv` passed dependency,
import and route-surface checks outside the checkout on Python 3.12.13. They did
not execute an agent or create a sandbox.

## SDK Changes

`sandbox.routes` is available on both synchronous and asynchronous clients:

- `expose()` creates a service route, protected by a scoped token by default.
- `list()` and `delete()` manage the sandbox's routes.
- `connect()` restores a saved grant without silently creating another exposure.
- `wait_for_http()` waits for application health with an explicit time budget.
  Authorization failures and missing/deleted grants are not retried as startup.
- `request()` sends bounded HTTP requests to the service without reusing the
  control-plane API credential or following redirects to another service.
- `connection(websocket=True)` returns a scoped WebSocket URL and headers for
  the application's chosen WebSocket client. It is not a bundled WebSocket client
  or an automatically reconnecting session.

Generic WebSocket transport requires Harakiri API **0.5.0-rc.14** and a compatible
ingress. A saved grant contains a secret; retain it server-side and do not place
its token in logs, browser storage or asset URLs. Route deletion revokes access;
it does not stop the application process or delete the sandbox.

The SDK now requires `certifi>=2026.10.18`, addressing
[GHSA-6q48-6c7w-9gw2](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2).
The development lock uses certifi 2026.10.23. No advisory waiver was added.

## Deep Agents Compatibility

`h-sandbox-deepagents==0.1.0rc2` depends on the exact SDK **0.1.0rc2** and Python
**deepagents==0.7.21**. This coordinates the SDK update; it does not widen the
framework compatibility range, change resource ownership or introduce an
OpenWebUI dependency. TypeScript Deep Agents is a separate, unchanged package.

The existing owned/borrowed sandbox, retained workspace, interruption and
uncertain-command recovery contracts remain in place. Application model
dependencies remain separate from both packages.

## Qualified Source And Archives

Both packages use reviewed source
`ea2f9feb8b51a85b5981f87ec2859b53a219334f`. The sealed release manifest has SHA-256
`39530ba010d19fcf199a10fb3f3c3f6ef9befbe546225d8399a2f8018e9a8c9e`.

| Archive | SHA-256 |
| --- | --- |
| `h_sandbox-0.1.0rc2-py3-none-any.whl` | `ddd71ab1a3cea95baf9645d10a6d08108e1e885010d11b0a5d3aeeb6a163fdb7` |
| `h_sandbox-0.1.0rc2.tar.gz` | `4a8a79597946a4e2f34ec40cc26aa371c2e50e921d040d04a28ff27e9498efd6` |
| `h_sandbox_deepagents-0.1.0rc2-py3-none-any.whl` | `989c7aab3bb3523479b33699d8121aef60a9ddfcad0a67158bd2b726fe7930fb` |
| `h_sandbox_deepagents-0.1.0rc2.tar.gz` | `2afa8ec38796f7f0957f2ea290d91ca0d5bd244dcb2fd5a8be0406a8fc695a79` |

Strict package/type checks and installed wheel/sdist consumers passed. The native
Python qualification retains its published rc.10 chart/web and separately
published API maintenance baseline; it is a compatibility regression gate, not
proof of generic WebSockets on that older API. New route operations have focused
HTTP/WebSocket protocol, credential, path-boundary and cancellation tests. The
coordinated core has separate native OpenWebUI evidence.

Publisher attestations verify archive integrity and publisher identity, not
package safety or independent adoption. Native GitHub fixtures do not change
the existing k0s lab. Independent operator installation and a complete OpenWebUI
workflow against the published adapter/template pair remain separate gates.

## Documentation

- [Python SDK](../python-sdk.md)
- [Python Deep Agents](../integrations/deepagents-python.md)
- [Protected service contract](../routes.md)
- [Release operations](../development/python-contributing.md#pypi-bootstrap-and-release-gate)
- [Earlier Python preview and qualification history](python-agents-preview.md)

# Python Development and Release Operations

From the repository root, install `uv` and Python 3.11 or newer. Dependencies are
locked in `python/uv.lock`; nothing is installed into system Python.

```sh
uv sync --project python --frozen
uv run --project python ruff check --config python/pyproject.toml packages/python-sdk packages/python-deepagents python examples/python-first-task examples/python-repository-repair examples/python-workflow-recovery infra/python-acceptance
uv run --project python mypy --config-file python/pyproject.toml packages/python-sdk/src packages/python-deepagents/src
uv run --project python pytest -q -c python/pyproject.toml packages/python-sdk/tests packages/python-deepagents/tests
uv run --project python python python/check_packages.py
```

The deliberately broken repair fixture is not part of the passing unit suite.
After editing the first-task programs, run `node scripts/python-doc-snippets.mjs`.
Web tests check that displayed code, downloads and source remain identical.
The package script builds wheel and sdist, installs each in a clean consumer
outside the checkout and checks public imports, metadata, typing and 16 MiB
binary transfer against a controlled HTTP fixture. Linux additionally enforces a 256 MiB address-space budget on
the model-free transfer process; this is not a memory budget for Deep Agents.

Native acceptance must run only through the GitHub-hosted ownership-guarded
workflow. Never invoke bootstrap against a workstation, ambient kubeconfig or
customer cluster. Forks get hermetic tests, not privileged runtime jobs. The
runner installs immutable published server artifacts and candidate Python wheels;
it publishes neither packages nor deployments. Only allowlisted receipts leave
the runner. No unrestricted logs, model output or checkpoints are artifacts.

## Compatibility Changes

Update the exact Deep Agents bound and the lock together. Review upstream public
backend protocols, rerun actual framework-visible termination/truncation tests,
both file modes, clean installed consumers and native recovery/model gates.
Do not copy private upstream shell scripts or silently add a newer framework to
the supported range. Keep core independent of framework/model dependencies.

## PyPI Bootstrap and Release Gate

Publication is a separately authorized phase. Neither project name is reserved by
a successful build. The maintainer must enable 2FA, confirm project ownership and
configure pending Trusted Publishers on PyPI and TestPyPI for this repository,
the exact release workflow filename and a protected GitHub environment. No token,
password or recovery code belongs in chat, Git or a CI receipt.

Use independent tags `python-sdk-v0.1.0rc1` and
`python-deepagents-v0.1.0rc1`, not application `v*` tags. Build once and qualify the
exact wheel/sdist hashes before the protected OIDC publication job. Publish SDK
first, verify anonymous registry hashes and install, then the adapter against that
exact public SDK. Verify attestations where available and rerun native consumers
using public artifacts. TestPyPI has separate publisher bindings; do not mix
indexes via an unrestricted extra index URL.

If only one package publishes, record partial success. Versions are immutable:
do not overwrite or silently rebuild an existing version. Reconcile file hashes,
complete the missing publication only when identical qualified artifacts are
available, or increment the affected version and requalify. Yank only with a
documented incident reason; retain safe previous releases for rollback. Review
release notes, installed hashes, support bounds and documentation deployment as
separate statuses. Independent adoption remains separate from CI success.

References: [PyPI pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/),
[SDK contract](../python-sdk.md), [design](python-client-design.md).

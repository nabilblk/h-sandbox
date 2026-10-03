# Python Development and Release Operations

From the repository root, install `uv` and Python 3.11 or newer. Dependencies are
locked in `python/uv.lock`; nothing is installed into system Python.

```sh
uv sync --project python --frozen
uv run --project python ruff check --config python/pyproject.toml packages/python-sdk packages/python-deepagents python examples/python-first-task examples/python-repository-repair examples/python-workflow-recovery infra/python-acceptance
uv run --project python mypy --config-file python/pyproject.toml packages/python-sdk/src packages/python-deepagents/src
uv run --project python mypy --config-file python/pyproject.toml examples/python-first-task
uv run --project python pytest -q -c python/pyproject.toml packages/python-sdk/tests packages/python-deepagents/tests
uv run --project python python python/check_packages.py
```

The deliberately broken repair fixture is not part of the passing unit suite.
After editing the first-task programs, run `node scripts/python-doc-snippets.mjs`.
Web tests check that displayed code, downloads and source remain identical.
Native acceptance also executes those exact public downloads with installed wheels
outside the checkout: local, owned, async and borrowed programs use real tools and
a loopback scripted Ollama endpoint. Inference is explicitly simulated for that
repeatable documentation gate; the separate digest-pinned real-model repair still
must pass. Local shell examples execute only on the disposable GitHub runner.
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

The current Python fixture keeps the released rc.10 chart/web baseline and applies
the published API maintenance image pinned in `infra/python-acceptance/versions.json`.
It verifies the checksum-pinned release receipt, anonymous registry manifests,
both architectures and source labels before an owned-fixture Helm upgrade, then
checks the running API image identity. This mixed-version baseline is explicit
in its receipt; no source API build or change to TypeScript acceptance is hidden
behind the Python qualification result.

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

For each registry, configure **both** `h-sandbox` and `h-sandbox-deepagents`:

| Publisher field | Value |
| --- | --- |
| GitHub owner | `nabilblk` |
| Repository | `h-sandbox` |
| Workflow filename | `python-release.yml` |
| GitHub environment on TestPyPI | `testpypi` |
| GitHub environment on PyPI | `pypi` |

Create matching GitHub environments with required maintainer review and a
deployment branch policy permitting only `main`. The release workflow checks
`RELEASE_REPOSITORY` against the running repository and accepts only a full commit
SHA already on `origin/main`. Creating the workflow does not create registry
accounts, reserve names or configure publisher bindings.

### Qualify, Then Publish

After the implementation and release workflow have passed review and merged:

```sh
git fetch origin main
RELEASE_SHA=$(git rev-parse origin/main)
gh workflow run python-release.yml --ref main \
  -f release_sha="$RELEASE_SHA" -f registry=testpypi -F publish=false
```

This builds wheel/sdist once, checks clean installed consumers, records a
hash-bound manifest and runs native qualification on an owned GitHub-hosted
fixture. It requests no publishing identity and touches no existing deployment.
The following separate invocation enables TestPyPI publication:

```sh
gh workflow run python-release.yml --ref main \
  -f release_sha="$RELEASE_SHA" -f registry=testpypi -F publish=true
```

Review the protected `testpypi` environment requests. Only the two publication
jobs receive `id-token: write`; they install or build no package code. They use
the pinned official PyPA action and generate publication attestations. The SDK
publishes first. Anonymous verification downloads its actual registry files and
checks their hashes before testing the candidate adapter. Only then may the
adapter publish. The public pair is verified with clean `uv` and `pip` consumers
and rerun through native acceptance without rebuilding.

Once that entire TestPyPI run is successful, supply its numeric run ID:

```sh
TESTPYPI_RUN=123456789
gh workflow run python-release.yml --ref main \
  -f release_sha="$RELEASE_SHA" -f registry=pypi -F publish=true \
  -f testpypi_run="$TESTPYPI_RUN"
```

Production checks the prior run belongs to this repository/workflow, completed
successfully on `main`, and contains TestPyPI evidence for the **same source and
all four archive hashes**. Expired or absent GitHub evidence fails closed; rerun
qualification instead of bypassing it. Required reviewers must inspect the
source, qualification result and registry before approving `pypi` publication.

Download `python-qualified-RUN_ID`, `python-public-RUN_ID` and the two native
receipts from the workflow run. The public artifact includes
`registry-receipt.json`; the manifest records source and archive hashes. Preserve
these as release assets when publishing the scoped Python GitHub releases.
Workflow success is not evidence of independent adoption or live docs deployment.

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

The publisher stages only missing files after downloading and checking every
already-published file against the qualified manifest. A different hash, yanked
file, unexpected archive, unauthorized response or registry outage stops delivery.
There is no blanket `skip-existing` switch. TestPyPI artifacts are downloaded
explicitly; third-party dependencies resolve only through the public PyPI index.

References: [PyPI pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/),
[SDK contract](../python-sdk.md), [design](python-client-design.md).

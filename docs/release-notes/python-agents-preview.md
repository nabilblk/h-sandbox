# Python Agents Preview

Status: **PyPI SDK and adapter published; final native verification and deployment in progress**, updated October 14, 2026.

- SDK `h-sandbox==0.1.0rc1`; import `harakiri`.
- Optional adapter `h-sandbox-deepagents==0.1.0rc1`; import `harakiri_deepagents`.
- Exact Python framework candidate: `deepagents==0.7.21`.
- Focused sync/async SDK, borrowed backend, explicit owned lifecycle, bounded
  commands/files, acknowledgement recovery and retained workspace examples.
- Python packages have independent preview versions. They do not publish npm
  packages, charts or provider images. The lab's API maintenance and documentation
  rollout are recorded separately below.

Local contract tests, strict type checks and clean wheel/sdist consumers are
implemented. Native Linux amd64 qualification retains the immutable published
chart/web `0.5.0-rc.10` baseline and applies the separately published API maintenance
release `api-2026-10-02.1`. Both identities and the template are digest-pinned in
`infra/python-acceptance/versions.json`, without repinning TypeScript acceptance.
Runner results and candidate hashes are recorded separately from publication.

## October 14 Release Record

The reviewed package source is
`fa8df3f3548a90b76a2b665c909f72cafbde052f`. PRs
[#66](https://github.com/nabilblk/h-sandbox/pull/66),
[#68](https://github.com/nabilblk/h-sandbox/pull/68) and
[#71](https://github.com/nabilblk/h-sandbox/pull/71) are merged.
Both projects now exist on TestPyPI and production PyPI, published through
separate GitHub OIDC identities. Anonymous downloads match all four sealed
archive hashes on both registries, and all eight publisher attestations passed
cryptographic verification.
Post-publication native qualification passed all 13 gates, fixture cleanup and
private-material removal in
[release run 38633897608](https://github.com/nabilblk/h-sandbox/actions/runs/38633897608).
The [permanent TestPyPI receipt](evidence/python-testpypi-2026-10-14.json)
retains the public-file, attestation and native qualification evidence.
[Production run 38640173942](https://github.com/nabilblk/h-sandbox/actions/runs/38640173942)
passed pre-publication native qualification and published the SDK before the
adapter. Final public-artifact native verification and the lab deployment remain
pending at this checkpoint.

Install in an activated Python 3.11+ environment:

```sh
python -m pip install "h-sandbox==0.1.0rc1"
# Optional framework integration; includes its exact SDK and framework dependency.
python -m pip install "h-sandbox-deepagents==0.1.0rc1"
```

Public projects: [SDK](https://pypi.org/project/h-sandbox/0.1.0rc1/) and
[Deep Agents adapter](https://pypi.org/project/h-sandbox-deepagents/0.1.0rc1/).
Model integrations are separate application dependencies; see the
[Python integration guide](../integrations/deepagents-python.md).

| Archive | SHA-256 |
| --- | --- |
| `h_sandbox-0.1.0rc1-py3-none-any.whl` | `187b70c2ab24b5f9d9970bc2087b8c08d4f916ae00924377b8a9ef7e25e61475` |
| `h_sandbox-0.1.0rc1.tar.gz` | `440787d19a1ce99021813c1b505ec161fc1cb961432315313c806ce1b15067b9` |
| `h_sandbox_deepagents-0.1.0rc1-py3-none-any.whl` | `aed49c5c6befe7cf9c77126bcb022c0934cdbf6a8fe6c1e2c3d257c822f7dcd7` |
| `h_sandbox_deepagents-0.1.0rc1.tar.gz` | `91cfc5e47937ffb42cbdf8035c448bdafa02cdb67aecc9452aea458dbf9931f0` |

The release manifest SHA-256 is
`f6f6c9367e6e60682204acbbddbedf0d1e5abdb224c33ae4910b66c9a75d6511`.
The October 2-5 candidate hashes below are historical, not these publication
artifacts. Updated package READMEs account for the changed archive hashes.

### Delivery Corrections and Boundaries

- [The first release attempt](https://github.com/nabilblk/h-sandbox/actions/runs/38632582104)
  failed before uploading: Twine 6.2 rejected metadata 2.5. PR #71 pins Twine 7
  and runs strict metadata checks in ordinary package CI, not only on release.
  Package runtime code and sealed archive bytes did not change.
- Both registries briefly returned metadata 404 after each successful package upload.
  Only failed verification jobs were rerun after public hashes matched; no
  archives were overwritten or republished. [PR #72](https://github.com/nabilblk/h-sandbox/pull/72)
  is merged and adds bounded polling for missing/incomplete publication metadata. Integrity,
  authentication and unexpected-file failures remain fatal.
- The approved TypeScript-only `braces` exception expires November 13, 2026.
  It is not a fix or a clean audit. The two tested paths, remaining local-backend
  exposure and removal work are documented in the
  [security assessment](../security/dependency-audit-2026-10.md) and
  [issue #70](https://github.com/nabilblk/h-sandbox/issues/70).
- Publisher attestations identify the publishing repository, workflow and
  environment; they do not prove package safety or independent adoption.
  Stable promotion and independent developer acceptance remain separate gates.

## Review Corrections

The post-review source fixes unsafe recursive-delete defaults, rejects empty/NUL
adapter deletion paths, drains interrupted synchronous task entry before HTTP
closure, and exposes synchronous command recovery metadata through
`HarakiriExecutionInterruptedError` (a `KeyboardInterrupt` subclass).

Local post-review checks passed on macOS: 97 tests on each of Python 3.11-3.14,
including real SIGINT in bounded, mock-only subprocesses and a separate minimum
AnyIO 4.9.0 check. Ruff, strict mypy (20 modules), rebuilt wheel/sdist consumers,
107 web tests and web typechecking passed. The bridge no longer uses a cosmetic
thread-name argument unsupported by the declared minimum AnyIO version.

The October 1 candidate wheel hashes and native runs below predate these fixes;
they are not qualification of newly built packages. Provider PR
[#67](https://github.com/nabilblk/h-sandbox/pull/67) is merged and its
[corrected API image is published](2026-10-02-provider-files-delivery.md).
Full Python native requalification against that public digest passed on October 2;
the old failing API image was not silently substituted with a runner-built one.
The review fixes passed [package CI](https://github.com/nabilblk/h-sandbox/actions/runs/36947022360)
and [repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/36947022380).

## Historical Qualification (October 2)

[Native run 36947872246](https://github.com/nabilblk/h-sandbox/actions/runs/36947872246)
passed all required gates, including fixture cleanup and private-material removal.
The [sanitized receipt](evidence/python-native-2026-10-02.json) records the exact
candidate artifacts built from PR merge source
`a8baad45bf4acc7082012fa1c473c4592f6ee6d4` (PR head `7232247`):

| Candidate wheel | SHA-256 |
| --- | --- |
| `h_sandbox-0.1.0rc1-py3-none-any.whl` | `02186e5580e6a220a23153fe375db721760b2cea03718b62822c9caba925f175` |
| `h_sandbox_deepagents-0.1.0rc1-py3-none-any.whl` | `b20d7acf77911192fbf2ea223ec26c1297c2674c30b99e726f0e155f2ba68c0c` |

The runner installed these wheels outside the checkout on Python 3.12.3/Linux
amd64, verified the running published API image, and exercised scoped/cross-org
denial, capacity rejection, sync/async tools, owned cleanup, borrowed survival,
separate-worker observation, retained-file recovery, provider loss, abnormal
termination, 1 MiB/16 MiB binary round trips and key revocation. The remote deadline
still reports exit code `-1` with generic reason `error`; the adapter exposes this
abnormal result without inventing a more precise provider classification.

Digest-pinned Qwen `qwen3:4b-instruct` performed a genuine repair: five model
responses and four tool responses produced a patch that passed four unchanged
original tests. The receipt includes the model, template and dependency versions.
This is one verified workflow, not a model benchmark or a repeatability guarantee.

[Package CI](https://github.com/nabilblk/h-sandbox/actions/runs/36947872253) passed
97 contracts on Python 3.11-3.14, strict typing, clean package consumers and the
bounded-memory binary fixture. [Repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/36947872244)
also passed. Introductory examples now have an explicit strict-mypy CI check in
addition to source/display/download synchronization tests; execution of all those
extracted introductory programs against installed packages remains a documentation
gate, distinct from the native SDK, recovery and model-repair workflows above.

[Standalone installation/recovery](https://github.com/nabilblk/h-sandbox/actions/runs/36947872279)
also passed independently on its unchanged published baseline, including cleanup.
That separate run does not substitute for the Python candidate receipt.

At that checkpoint, no Python package was published and no existing deployment was changed. The
following history preserves failed attempts rather than treating passing subcases
as full qualification.

## Historical Qualification (October 1)

| Evidence | Result |
| --- | --- |
| [Python packages, commit 69dc24c](https://github.com/nabilblk/h-sandbox/actions/runs/36873196247) | Passed: 72 contracts on Python 3.11-3.14, types/packages, Linux 256 MiB address-space binary fixture, clean macOS/Windows consumers |
| [Repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/36873196245) | Passed |
| [Standalone installation/recovery](https://github.com/nabilblk/h-sandbox/actions/runs/36873196374) | Passed on the unchanged standalone baseline; no lab deployment |
| Local contract suite before review | 72 tests passed, including real loopback sockets, SQLite checkpoint reopening, concurrent observers and mismatched command-response rejection |
| Documentation before review | 106 web unit tests and 12 browser tests passed; Python comparisons checked at 320/390/768/1024/1440px |
| [First native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36861333245) | Failed a whitespace-sensitive fixture assertion; the provider appends a newline to command output. Corrected the assertion, not the SDK output. Owned cleanup passed. |
| [Second native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36862236924) | Receipt records `ProviderError` uploading 1 MiB on published rc.10; cleanup passed. Workflow ultimately reported cancelled. Not a passing qualification. |
| [Third native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36863606183) | Failed an acceptance assertion expecting the legacy file-content line array; pinned Deep Agents returns text. Fixture corrected and actual `read_file` tool regression added. Owned cleanup passed. |
| [Fourth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36864704338) | Failed the remote-deadline assertion. The original fixture required one notice wording. A separate mandatory deadline gate now records the actual exit code, finish reason and presence of a framework-visible abnormal notice; no normal outcome is accepted as a timeout. Owned cleanup passed. |
| [Fifth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36865611307) | Scoped-key denial, sync lifecycle/framework tools and native async tools passed. Recovery then failed an immediate-detachment assertion. The corrected fixture observes workspace availability before replacement. Owned cleanup passed. |
| [Sixth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36866686680) | Workflow, retained-file recovery, provider-loss handling, abnormal remote termination, real model repair and key revocation passed. The 1 MiB transfer failed with `502 runtime_files_unavailable`. Overall result remains failed; owned cleanup passed. |
| [Seventh native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36869003900) | SDK/framework workflows, recovery, provider loss and abnormal termination passed with the command-identity changes. The upload failed again; model repair failed without a structured model result. Overall failed; owned cleanup passed. |
| [Eighth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36870079775) | Cancelled during installation while the model harness was being corrected. Cleanup passed and private material was removed; no qualification result is claimed. |
| [Final code-revision attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36873196244) | Tenant isolation, sync/async workflows, recovery, provider interruption, abnormal termination, real model repair and key revocation passed. The only failed gate was the 1 MiB upload; overall failed. Runtime and fixture cleanup passed. |

The [sanitized sixth-run receipt](evidence/python-native-2026-10-01.json) preserves
the exact candidate wheel hashes, tested source, server/template/model identities,
outcomes and cleanup. The pinned Qwen model produced a patch that passed all four
unchanged original tests; the run observed ten model responses and nine tool
responses. This proves one repair workflow, not a model benchmark or adversarial
verification. The remote-deadline exercise returned exit code `-1` and generic
finish reason `error`; the adapter exposed an abnormal notice, not an invented
precise timeout classification.

That first successful model receipt predates the final command-identity and
foreign-organization checks. The [final-code receipt](evidence/python-native-2026-10-01-final.json)
records their successful native execution, all key framework dependency versions,
and another genuine repair: five model responses, four tool responses and four
unchanged original tests passing. Its only failed gate is the native upload.
See [PR #66](https://github.com/nabilblk/h-sandbox/pull/66) for review.
A passing subcase is not a passing overall run.

The seventh attempt's model failure remains part of the record. Its timing is
consistent with the outer 15-minute subprocess limit, but the precise cause was
not preserved.
The Linux-only inference harness now has an explicit 12-minute budget, shorter than
the process limit so SDK cleanup can finish, and allowlisted elapsed-time/failure
diagnostics. The tiny repair example combines inspection in one tool call and
avoids planning/delegation overhead. It still runs the actual framework/model and
independently checks the unchanged original tests; no mocked repair is substituted.
The corrected harness passed in the final-code run. This is bounded workflow
evidence, not a universal model-latency or repeatability guarantee.

The mandatory large-artifact gate remains at 1 MiB and 16 MiB. Basic workflow
checks also exercise smaller binary/text files so one transfer failure does not
hide framework/recovery evidence. This does not qualify a lower universal limit.

### Original Blocker: Native Binary Upload

The original provider failure was not a Python codec memory failure. The API
shipped in rc.10 embedded base64 file contents inside one shell-command argument.
Provider PR
[#67](https://github.com/nabilblk/h-sandbox/pull/67) independently confirmed the
argument-size failure and qualified a native multipart/binary transfer correction
with 1 MiB/16 MiB round trips. Its [maintenance release](2026-10-02-provider-files-delivery.md)
supplied the public image for the passing October 2 Python qualification. Plain rc.10 and rc.12
images remain unchanged. Do not bypass the control plane or chunk shell writes
in the Python SDK to mask the old failure.

OpenSandbox exposes a native multipart file endpoint in its
[official specification](https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/execd-api.yaml).
The separate provider candidate validates the pinned runtime's contract, atomic
replacement, cleanup, permissions and transfer limits.
The Python PR does not silently install an unreleased API to obtain a green run.

### October 3: Exported Introductory Programs Qualified

Native [run 37123459321](https://github.com/nabilblk/h-sandbox/actions/runs/37123459321)
passed all 13 gates against the same published server baseline. The
[retained receipt](evidence/python-native-2026-10-03.json) records exact downloaded
program hashes and successful local, owned, async and borrowed execution against
installed wheels. Inference for those four documentation checks is a scripted
loopback Ollama fixture; tools and runtime cleanup are real. The independent,
digest-pinned Qwen repair also passed with all four original tests unchanged.
The package wheel hashes remain identical to October 2.

Release tooling now prepares a protected, manually dispatched `python-release.yml`
pipeline: exact-archive qualification, TestPyPI before production, SDK before
adapter, anonymous public-file checks, `pip`/`uv` consumers and post-publication
native qualification. GitHub publishing environments were configured with
maintainer review and `main`-only access. This is preparation, not publication.
See [release operations](../development/python-contributing.md#pypi-bootstrap-and-release-gate)
for the exact publisher fields and commands.

PR #66's merge is currently held by the existing JavaScript dependency audit:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects
`braces` through the TypeScript framework dependency, and no patched npm version
was available on October 3. The audit threshold remains unchanged.

### October 5: Trusted Publishers Configured

Authenticated PyPI and TestPyPI account pages confirm maintainer `nabilblk` and
pending publishers for both packages, tied to `nabilblk/h-sandbox` and
`python-release.yml`. SDK jobs use `testpypi`/`pypi`; adapter jobs use
`testpypi-deepagents`/`pypi-deepagents`. All four GitHub environments require
maintainer approval and restrict deployments to `main`. The separate adapter
identity is required because a second pending project cannot reuse the same
repository/workflow/environment tuple. Workflow tests and the release guide now
enforce that distinction. No reusable token was created.

The final release-tooling [native run](https://github.com/nabilblk/h-sandbox/actions/runs/37124905006)
passed all 13 gates with the same candidate wheel hashes and confirmed fixture
cleanup. That run predates the environment correction and is still candidate
evidence, not a completed publication. The dependency audit blocker above remains.

**Not completed as of October 5:** merge, registry project creation and publication, public-artifact
native verification, public documentation deployment and independent adopter
evidence. Source installation is documented; do not announce public availability
or stable support from this candidate record.

See [SDK guide](../python-sdk.md), [integration](../integrations/deepagents-python.md)
and [technical design](../development/python-client-design.md).

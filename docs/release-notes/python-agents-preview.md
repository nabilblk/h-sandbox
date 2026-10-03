# Python Agents Candidate

Status: **unreleased candidate; native qualification passed**, October 2, 2026.

- SDK `h-sandbox==0.1.0rc1`; import `harakiri`.
- Optional adapter `h-sandbox-deepagents==0.1.0rc1`; import `harakiri_deepagents`.
- Exact Python framework candidate: `deepagents==0.7.21`.
- Focused sync/async SDK, borrowed backend, explicit owned lifecycle, bounded
  commands/files, acknowledgement recovery and retained workspace examples.
- This candidate changes no API, schema, npm package, deployed cluster or provider.

Local contract tests, strict type checks and clean wheel/sdist consumers are
implemented. Native Linux amd64 qualification retains the immutable published
chart/web `0.5.0-rc.10` baseline and applies the separately published API maintenance
release `api-2026-10-02.1`. Both identities and the template are digest-pinned in
`infra/python-acceptance/versions.json`, without repinning TypeScript acceptance.
Runner results and candidate hashes are recorded separately from publication.

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

## Current Qualification

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

No Python package was published and no existing deployment was changed. The
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

**Not completed:** the remaining introductory-example documentation gate, public PyPI
name/publisher setup, publication, public-artifact
native verification, public documentation deployment and independent adopter
evidence. Source installation is documented; do not announce public availability
or stable support from this candidate record.

See [SDK guide](../python-sdk.md), [integration](../integrations/deepagents-python.md)
and [technical design](../development/python-client-design.md).

# Python Agents Candidate

Status: **unreleased implementation candidate**, October 1, 2026.

- SDK `h-sandbox==0.1.0rc1`; import `harakiri`.
- Optional adapter `h-sandbox-deepagents==0.1.0rc1`; import `harakiri_deepagents`.
- Exact Python framework candidate: `deepagents==0.7.21`.
- Focused sync/async SDK, borrowed backend, explicit owned lifecycle, bounded
  commands/files, acknowledgement recovery and retained workspace examples.
- This candidate changes no API, schema, npm package, deployed cluster or provider.

Local contract tests, strict type checks and clean wheel/sdist consumers are
implemented. Native Linux amd64 qualification targets the immutable published
server/chart `0.5.0-rc.10` and digest-pinned template in
`infra/python-acceptance/versions.json`, without repinning TypeScript acceptance.
Runner results and candidate hashes are recorded separately from publication.

## Qualification Evidence

| Evidence | Result |
| --- | --- |
| [Python packages, commit 69dc24c](https://github.com/nabilblk/h-sandbox/actions/runs/36873196247) | Passed: 72 contracts on Python 3.11-3.14, types/packages, Linux 256 MiB address-space binary fixture, clean macOS/Windows consumers |
| [Repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/36873196245) | Passed |
| [Standalone installation/recovery](https://github.com/nabilblk/h-sandbox/actions/runs/36873196374) | Passed on the unchanged standalone baseline; no lab deployment |
| Local contract suite | 72 tests passed, including real loopback sockets, SQLite checkpoint reopening, concurrent observers and mismatched command-response rejection |
| Documentation | 106 web unit tests and 12 browser tests passed; Python comparisons checked at 320/390/768/1024/1440px |
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
See [draft PR #66](https://github.com/nabilblk/h-sandbox/pull/66) for review.
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

### Release Blocker: Native Binary Upload

The live provider failure is not a Python codec memory failure. Current
`apps/api/src/providers/runtime/opensandbox-files.ts` embeds base64 file contents
inside one shell-command argument. Exceeding an OS argument limit is a plausible
cause, not yet a confirmed diagnostic from the sanitized receipt. A separate
provider change must reproduce and fix the failure, with independent compatibility
and native evidence. Do not bypass the control plane or chunk shell writes in
the Python SDK to mask it.

OpenSandbox exposes a native multipart file endpoint in its
[official specification](https://github.com/opensandbox-group/OpenSandbox/blob/main/specs/execd-api.yaml).
That is a candidate provider-side correction, subject to the pinned runtime's
contract, atomic replacement, cleanup, permissions and transfer-limit tests.
The Python PR does not silently install an unreleased API to obtain a green run.

**Not completed:** full native qualification, public PyPI name/publisher setup, publication, public-artifact
native verification, public documentation deployment and independent adopter
evidence. Source installation is documented; do not announce public availability
or stable support from this candidate record.

See [SDK guide](../python-sdk.md), [integration](../integrations/deepagents-python.md)
and [technical design](../development/python-client-design.md).

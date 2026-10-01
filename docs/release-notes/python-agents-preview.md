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
| [Python packages, commit 06ec865](https://github.com/nabilblk/h-sandbox/actions/runs/36866686622) | Passed: Python 3.11-3.14 contracts/types/packages, Linux 256 MiB address-space binary fixture, clean macOS/Windows consumers |
| [Repository CI](https://github.com/nabilblk/h-sandbox/actions/runs/36866686603) | Passed |
| Local contract suite | 72 tests passed, including real loopback sockets, SQLite checkpoint reopening, concurrent observers and mismatched command-response rejection. The additional command regressions still require the next CI run. |
| Documentation | 106 web unit tests and 12 browser tests passed; Python comparisons checked at 320/390/768/1024/1440px |
| [First native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36861333245) | Failed a whitespace-sensitive fixture assertion; the provider appends a newline to command output. Corrected the assertion, not the SDK output. Owned cleanup passed. |
| [Second native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36862236924) | Receipt records `ProviderError` uploading 1 MiB on published rc.10; cleanup passed. Workflow ultimately reported cancelled. Not a passing qualification. |
| [Third native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36863606183) | Failed an acceptance assertion expecting the legacy file-content line array; pinned Deep Agents returns text. Fixture corrected and actual `read_file` tool regression added. Owned cleanup passed. |
| [Fourth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36864704338) | Failed the remote-deadline assertion. The original fixture required one notice wording. A separate mandatory deadline gate now records the actual exit code, finish reason and presence of a framework-visible abnormal notice; no normal outcome is accepted as a timeout. Owned cleanup passed. |
| [Fifth native attempt](https://github.com/nabilblk/h-sandbox/actions/runs/36865611307) | Scoped-key denial, sync lifecycle/framework tools and native async tools passed. Recovery then failed an immediate-detachment assertion. The corrected fixture observes workspace availability before replacement. Owned cleanup passed. |

The [next native run](https://github.com/nabilblk/h-sandbox/actions/runs/36866686680)
was still running at this checkpoint; its recovery/model outcomes are not claimed.
See [draft PR #66](https://github.com/nabilblk/h-sandbox/pull/66) for subsequent
checks and sanitized receipts. A passing subcase is not a passing overall run.

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

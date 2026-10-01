# Python Agents Candidate

Status: **unreleased implementation candidate**, October 1, 2026.

- SDK `h-sandbox==0.1.0rc1`; import `harakiri`.
- Optional adapter `h-sandbox-deepagents==0.1.0rc1`; import `harakiri_deepagents`.
- Exact Python framework candidate: `deepagents==0.7.21`.
- Focused sync/async SDK, borrowed backend, explicit owned lifecycle, bounded
  commands/files, acknowledgement recovery and retained workspace examples.
- No API, schema, npm, cluster or provider changes are required.

Local contract tests, strict type checks and clean wheel/sdist consumers are
implemented. Native Linux amd64 qualification targets the immutable published
server/chart `0.5.0-rc.10` and digest-pinned template in
`infra/python-acceptance/versions.json`, without repinning TypeScript acceptance.
Runner results and candidate hashes must be recorded here after execution.

**Not completed:** public PyPI name/publisher setup, publication, public-artifact
native verification, public documentation deployment and independent adopter
evidence. Source installation is documented; do not announce public availability
or stable support from this candidate record.

See [SDK guide](../python-sdk.md), [integration](../integrations/deepagents-python.md)
and [technical design](../development/python-client-design.md).

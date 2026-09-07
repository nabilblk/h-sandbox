# Workspace API, SDK and CLI

Read [Workspaces](workspaces.md) for the model or use the
[checkpoint/reconnect tutorial](persistent-workspaces.md) for a full scenario.
This reference describes `0.5.0-rc.2`. API and scheduler must have workspace
support enabled. SDK/CLI candidate archives are available from the operator;
npm publication was pending at release. See the
[delivery receipt](release-notes/0.5.0-rc.2-delivery.md) for checksums and install steps.

## HTTP Operations

Authentication is an organization API key (`x-api-key`) or Keycloak bearer token.
The server derives organization ownership from authentication, not the body.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/v1/workspaces` | `{ workspaces, policy }`; includes archived records, newest first, up to 1,000. No pagination/list filters in this preview. |
| POST | `/v1/workspaces` | `201 { workspace }`; metadata creation with `{ "name": "agent-project" }`. |
| GET | `/v1/workspaces/{id}` | `{ workspace }` scoped to the organization. |
| POST | `/v1/workspaces/{id}/archive` | `{ workspace }`; detached logical archive retaining files and quota. Repeated archive is allowed. |

Create accepts only `name`, trimmed to 1-80 characters. It must start with a
Unicode letter or number, followed by letters, numbers, spaces, periods,
underscores or hyphens. Names are unique within the organization, including
archived records. Extra fields are rejected; size/class/provider are not client
options. Create does not start a sandbox or prove a volume is healthy.

Attach through `POST /v1/sandboxes` using a template and `workspaceId`. Attachment
is immutable for that sandbox. Snapshot restore with a workspace is rejected.
There are no workspace rename, resize, detach, unarchive or physical-delete APIs.

## Response Fields

`WorkspaceSummary` contains:

- `id`, `name`: public `wsp_...` identifier and display name.
- `sizeGiB`, `mountPath`: configured capacity, not usage; path is `/workspace`.
- `status`: `available`, `attached`, `releasing`, `recovery_required` or `archived`.
- `attachedSandboxId`: owning sandbox ID or null; may remain after an error/termination.
- `storageRequested`: first provisioning was attempted, not a mount-health guarantee.
- `createdAt`, `updatedAt`, `archivedAt`: ISO timestamps; archivedAt is nullable.

`policy` contains `available`, nullable `reason`, `sizeGiB`, `maxPerOrganization`,
`mountPath`, `retention: "until_operator_reclaims"` and `physicalDeletion: false`.
Existing records remain readable when creation is unavailable. Availability is
a configuration/capability gate, not a live storage probe.

## SDK and CLI

SDK methods are `client.workspaces.list()`, `.create({ name })`, `.get(id)` and
`.archive(id)`. They return the same envelopes as HTTP. Use
`client.createSandbox({ template, workspaceId, ttlSeconds })` to attach, then wait
for the sandbox. After kill, poll the workspace until available before reuse or
archive. The [tutorial](persistent-workspaces.md) includes bounded polling.

```bash
harakiri workspace create --name agent-project --json
harakiri workspace list --json
harakiri workspace inspect wsp_...
harakiri create --template python-3.12 --workspace wsp_... --ttl 600
# Only after termination and confirmed release:
harakiri workspace archive wsp_... --retain-storage
```

Create/list accept `--json`; inspect prints JSON. List JSON includes policy.
Archive requires the retained-storage acknowledgment. For an archive-installed
local CLI, use `./node_modules/.bin/harakiri`.

## Errors

| HTTP | Code | Action |
| --- | --- | --- |
| 400 | `validation_error` | Check name and body; snapshot/workspace combinations fail validation. |
| 401 | `unauthorized` | Supply valid organization credentials. |
| 404 | `workspace_not_found` | Check ID and organization; cross-org reads do not expose records. |
| 409 | `workspace_name_conflict` | Choose another name, including when the previous record is archived. |
| 409 | `workspace_quota_exceeded` | Allocation is full or busy; archive does not free it. |
| 409 | `workspace_unavailable` | Wait for Available or choose another workspace. |
| 409 | `workspace_attached` | Terminate the owner and wait for release before archive. |
| 409 | `workspace_provider_mismatch` | Changing providers does not migrate retained storage. |
| 409 | `workspace_attachment_ambiguous` | Reconcile the prior create; do not blindly replay it. |
| 409 | `workspace_reservation_missing` | Inspect owner and operation state. |
| 409 | `workspace_snapshot_unsupported` | Back up files separately; runtime snapshot is unsupported. |
| 501 | `workspaces_unavailable` | Enable a valid storage profile and supported, fail-closed provider. |

See [operator recovery](persistent-workspace-operations.md). Provider failures
may leave a reservation deliberately held; an error is not proof of no runtime.

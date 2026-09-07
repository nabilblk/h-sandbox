# Workspaces

A workspace is organization-owned persistent **storage**, mounted at
`/workspace`. A sandbox is the isolated **runtime** that uses it. An application
can replace a sandbox while keeping its project files through the same `wsp_...`
ID. Reuse is sequential, not a shared writable mount for parallel sandboxes.

## Related Concepts

| Concept | Responsibility |
| --- | --- |
| Organization | Team membership and authorization; owns workspaces and sandboxes. |
| Workspace | Retained project files with one sandbox reservation at a time. |
| Sandbox | Processes, memory and the runtime filesystem. |
| Template | Image and defaults for a new sandbox, not evolving workspace data. |
| Command session | Command working directory/environment, not durable storage. |
| Snapshot | Separate provider lifecycle state; not a workspace backup in this preview. |
| Credential Vault | Credential custody, not ordinary project-file persistence. |

Some older screens call the organization a team workspace. That is distinct
from a persistent workspace. Workspace records do not create a new team or grant
membership, and there is no separate per-workspace ACL. They are not private to
the user who created them; organization authorization applies.

## Lifecycle

Creating metadata reserves an organization allocation slot. Backing storage is
requested on first attachment. `storageRequested` means provisioning was
attempted, not that storage exists or is healthy.

| State | Meaning |
| --- | --- |
| `available` | No sandbox owns the reservation; a compatible sandbox may attach. |
| `attached` | One owner, including a provisioning or paused sandbox. |
| `releasing` | Sandbox terminated; provider absence or lifecycle cleanup still pending. |
| `recovery_required` | An errored sandbox still owns the reservation; reconcile its outcome. |
| `archived` | Logically retired, detached and unavailable for new attachment; data/quota retained. |

A normal cycle is available, attached, releasing, then available again. Fast
cleanup may make releasing unobservable to a polling client. Wait for available
after termination before attaching the next sandbox. Never assume a timeout means
the provider did not create a runtime, and never force a second writer.

There is no public rename, resize, detach, unarchive or physical-delete operation.
Changing a running sandbox's workspace is unsupported. Clients use Harakiri IDs,
not private volume names, storage-class choices or provider references.

## What Persists

Files under `/workspace` survive sandbox termination. Process memory, running
commands and files outside the mount are not part of this contract. A template's
existing `/workspace` content is hidden by the mount, not copied into it. Seed a
new workspace explicitly and check compatibility before changing templates.

A command stream observes retained provider logs; reconnect does not revive a
terminated process or guarantee logs survive sandbox deletion. Keep checkpoints
as files or download required artifacts separately.

## Retention and Security

Archive is logical retirement, not secure erasure. Archived records keep their
names and allocation slots. Manual PVC reclamation does not automatically recycle
quota. Configured capacity is not used-byte measurement.

Backup, encryption and durability depend on the operator's storage system. A
single-node local-path volume is not protection against node loss. Database
backups cover metadata, not project files. Snapshots of workspace-backed runtimes
and snapshot restore with workspace attachment are rejected in this preview.

Credentials an agent writes to files can persist. Revoking a Vault credential
cannot scrub retained files, logs or backups. Persistent storage does not change
egress policy or grant cluster access.

## Availability and Next Steps

This describes `0.5.0-rc.3`, with opt-in native OpenSandbox support. k0s acceptance
passed; restricted OpenShift acceptance remains pending. Stable npm 0.4.0 does
not contain the feature. Verify candidate npm availability or install matching
release archives. This candidate corrects the earlier renewal/scheduler defect;
operators must apply migration 036 with matching API and scheduler versions.
Following command output does not renew TTL. Explicitly renew long-running jobs.

- [Tutorial: reuse files across sandboxes](persistent-workspaces.md).
- [Workspace API, SDK and CLI](workspace-reference.md).
- [Persistent storage operations](persistent-workspace-operations.md).
- [Architecture decision](adr/0009-persistent-workspaces-and-command-streams.md).
- [Release availability and known gates](release-notes/0.5.0-rc.3.md).

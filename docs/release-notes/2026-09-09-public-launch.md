# September 9: Public Launch Preparation

This is a source/publication and owned-lab operations receipt, not a new npm
version or a production-readiness certificate. The supported candidate remains
`0.5.0-rc.8` on `next`; the older stable channel remains `0.4.0`.

## Product Positioning

Harakiri Sandbox is the **self-hosted sandbox control plane for agent
applications**. The API, TypeScript SDK, CLI and dashboard share product
concepts for environments, access, templates, workspaces and results.
OpenSandbox is the current execution adapter behind `RuntimeProvider`, not
the product's identity. Additional providers and a first-party runtime are
future options, not implemented integrations or a live-migration guarantee.

README, homepage, architecture diagram, vision narrative, generated documentation
indexes and announcement drafts now express that boundary. The homepage no
longer claims microVM execution, a synthetic 137 ms provisioning time or disk
zeroing. Its terminal is explicitly an example; recorded demos retain their
original evidence and versions.

## Owned Lab Credential Rotation

Verified September 9 at 16:13 UTC, against the explicit Harakiri k0s context:

| Credential | Result |
| --- | --- |
| Harakiri human administrator | Password replaced; old login rejected; current login retains the same user, organization and admin role |
| Keycloak master recovery administrator | Password replaced; old login rejected; current recovery verified after restart |
| PostgreSQL application role | Actual database role and consumer Secret updated; new password works and old password fails from the API pod's network path |
| Runtime provider connection | Server configuration and API Secret updated; new key accepted, old key denied |
| Vault wrapping key | Active key replaced in API and workers; no remaining encrypted payload required rewrapping |

All 18 Vault records were already deleted tombstones with no ciphertext or
wrapped keys. They were preserved unchanged. This is not evidence of a live
encrypted-row rewrap or recovery test. API keys, users, memberships, workspace
IDs, realm/client settings, signing keys and SMTP configuration were preserved.
Human/recovery sessions were invalidated; existing signed access tokens remain
bounded by their configured expiry.

Replacement values and recovery backups were delivered in the owner's private
configuration directory, not Git, release assets or public docs. Current Helm
values agree with live Secrets. Older release revisions/backups contain revoked
credentials and must not be restored independently of their matching data.
Personal npm, GitHub, Harbor and external service accounts were outside scope.

### Identity Persistence Correction

The lab Keycloak deployment previously stored H2 in its ephemeral container
layer. Restarting it could lose current identities and reimport development
credentials. A brief JVM freeze produced a crash-consistent copy; an isolated
Keycloak instance recovered that copy and verified both realms, users, roles,
clients, signing keys and current passwords before cutover. This was not an
online logical export or a production backup certification.

The existing service now mounts the `keycloak-data` PVC and uses one database
writer with a `Recreate` rollout. A subsequent restart verified that the new
passwords persist. Temporary staging resources were removed. The live import
ConfigMap no longer contains development users. Public OIDC URLs are unchanged.
The development manifest now declares persistent storage, but must not be
applied over an existing populated installation without verified data migration.

This remains a single-node H2 lab. New shared installations use the
[PostgreSQL-backed identity profile](../../infra/preview/README.md); this repair
does not imply production H2 support, HA or disaster-recovery certification.

## Publication and Delivery

Source opening is owner-authorized. Visibility transition, anonymous-access
verification, public-repository security settings and deployment of the wording
correction are recorded here when completed. No social announcement has been
posted. The [announcement kit](../launch/oss-developer-preview-announcement.md)
remains a draft for text/channel approval.

The [rc.8 receipt](0.5.0-rc.8-delivery.md) retains exact prior artifacts and
verification boundaries. Existing API image advisories, incomplete concurrency
admission, restricted OpenShift acceptance, unattended npm publishing and
post-launch adoption outcomes remain explicit work, not erased by source opening.

# September 9: Public Source Launch

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

The owner-authorized repository [nabilblk/h-sandbox](https://github.com/nabilblk/h-sandbox)
became **public** on September 9. Anonymous clone and release/package access
were verified at 16:28 UTC; repository protections were verified at 16:29 UTC.
No social announcement or public Discussion announcement has been posted. The
[announcement kit](../launch/oss-developer-preview-announcement.md) remains a
draft for text/channel approval.

### Source and Deployed Artifacts

- Positioning source: [`2e539446974a701719a2261ca5163ed0334c9d85`](https://github.com/nabilblk/h-sandbox/commit/2e539446974a701719a2261ca5163ed0334c9d85).
- All eight [source CI checks](https://github.com/nabilblk/h-sandbox/actions/runs/34375645031)
  passed. [Web publication](https://github.com/nabilblk/h-sandbox/actions/runs/34375786985)
  built both amd64 and arm64. An earlier short-SHA dispatch was rejected by the
  source validation guard before publication; the full-SHA rerun passed.
- Deployed web: `core.campus.clusterdiali.me/harakiri/harakiri-web:0.5.0-rc.8-docs.2@sha256:23409e446df6bd7e28d02d5476ac7e3f41bf98f635f353c58bc0410846b119a1`.
- The [public-launch values overlay](0.5.0-rc.8-public-values.yaml) pins that web
  image and the unchanged rc.8 API image. Chart and npm artifacts did not change.
  The original eight rc.8 release attachments and `docs.1` overlay remain intact;
  the later web correction is not retroactively part of that checksum bundle.
- Lab web deployment was verified at 16:22 UTC. New credentials, data, SMTP and
  public web/API/OIDC origins were preserved. The login theme also replaces the
  synthetic benchmark with an explicitly illustrative CLI workflow.

### Verification

- Local web tests: 69 passing; typecheck, build and documentation-link checks pass.
  Desktop/mobile browser inspection found no page overflow; the updated diagrams
  render. The existing large-bundle build warning remains.
- Public browser sign-in with the replacement password reached the administrator
  dashboard; logout returned to the public site. Web, API and OIDC checks pass.
  All 35 Markdown pages, JSON/text indexes, MIME types and missing-page 404s pass.
  This is not a new sandbox workload or amd64 runtime acceptance run.
- Anonymous Git clone exposed the expected source and Apache-2.0/community files.
  All eight rc.8 assets downloaded; all seven `SHA256SUMS` entries matched.
  SDK/CLI registry tarballs matched SHA-512 integrity; dist-tags remain unchanged.
- Final pre-opening Gitleaks 8.30.1 tree/history scan: 939 tracked files and 64
  refs, no unresolved findings. Remote review covered 26 release assets, 150
  available Actions artifacts and 90 available log archives. Fifty-six expired
  artifacts and 53 unavailable logs were excluded. All 21 scan matches were
  reviewed copies of the same immutable image tag, not credentials. No remote
  logs/artifacts were deleted or blanket exception introduced.
- Exact `docs.2` arm64 SBOM/vulnerability scan: five medium findings, no high or
  critical findings in that scanner database. This does not replace the earlier
  API scan, establish amd64 scan parity or certify vulnerability-free images.

### Repository Controls and Handoff

GitHub private vulnerability reporting, secret scanning, push protection and
dependency vulnerability alerts are enabled. The signed-out Security page exposes
the private report entry point; no synthetic vulnerability report was submitted.
The alert API returned no secret-scanning alerts at the post-opening check.

`main` requires a PR, all eight CI checks and an up-to-date branch. The rule
applies to administrators, disallows force pushes/deletion and requires no
second-person approval for this solo-maintainer preview. All external contributors
require workflow approval; default workflow tokens are read-only and cannot
approve PRs. The `harbor` and `npm` environments accept only `main` and require
owner review, with self-review allowed. This is not independent release approval
or proof that unattended npm publishing works.

Owner action before promotion: enable **Watch > All Activity** and email for
watched repositories, then verify receipt. The current operator token cannot
configure notification subscriptions. Private form availability is verified;
notification/inbox delivery is not. [SECURITY](../../SECURITY.md) retains the
owner-designated email fallback without inventing an acknowledgement or SLA.

The [rc.8 receipt](0.5.0-rc.8-delivery.md) retains exact prior artifacts and
verification boundaries. Existing API image advisories, incomplete concurrency
admission, restricted OpenShift acceptance, unattended npm publishing and
post-launch adoption outcomes remain explicit work, not erased by source opening.

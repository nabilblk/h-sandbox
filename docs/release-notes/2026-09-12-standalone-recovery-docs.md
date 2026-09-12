# Standalone Recovery Qualification and Documentation Delivery

September 12, 2026. Native acceptance merged; a web-only documentation image
published and deployed. This is not a new application version, npm release,
chart release or stable promotion. The original `0.5.0-rc.9` bundle is unchanged.

## Source and Verification

- [PR #42](https://github.com/nabilblk/h-sandbox/pull/42), acceptance and technical
  runbook, merged as `6830fe558f28cd10c023b0e1730dd77afc61876a`.
- [PR #43](https://github.com/nabilblk/h-sandbox/pull/43), first-class public
  recovery documentation, merged as `13de13ac37d50ca21800a653a21fd814a9415241`.
  All nine PR checks and subsequent main CI/demo checks passed. Local web tests
  passed all 86 checks; web type checking and the scoped secret scan passed.
- The native acceptance suite passed all seven configured gates and cleanup in
  three consecutive fresh hosted runs:
  [34659892741](https://github.com/nabilblk/h-sandbox/actions/runs/34659892741),
  [34660902435](https://github.com/nabilblk/h-sandbox/actions/runs/34660902435) and
  [34661147374](https://github.com/nabilblk/h-sandbox/actions/runs/34661147374).
  The [retained receipt](../operations/evidence/standalone-34659892741.json)
  records actual published rc.9 artifacts, not locally rebuilt application code.

The verified profile is native Linux amd64, single-node k0s 1.36.3 and local-path
storage. Real OIDC and published SDK/CLI tests cover first work, admission denial,
protected routes, retained workspace reuse, both databases on replacement storage,
wrong/missing-key rejection, restored HTTPS credential injection, provider
interruption/state rehydration, configuration rollback, logout and key revocation.
Source database shutdown and empty replacement workspace storage prevent surviving
source data from satisfying the recovery checks.

## Public Documentation

[Backup and recovery](https://sb.harakiri.io/#docs/backup-recovery) is now under
Self-hosting, immediately after
[Install on Kubernetes](https://sb.harakiri.io/#docs/install-kubernetes). It
covers the four parts of a coherent backup, guarded reference database commands,
isolated-target restoration, recovery validation, provider uncertainty and
upgrade/rollback limits. Commands are syntax-checked and match the
[technical runbook](../operations/standalone-recovery.md) exactly.

The guide is linked from overview, installation, vision and preview scope, and
included in search, reading progression, mobile navigation, Markdown downloads,
`/docs/index.json`, `/llms.txt` and `/llms-full.txt`. Current-version entry points
now use rc.9. The [public changelog](https://sb.harakiri.io/#changelog) calls this
a documentation update, not a new feature or application version.

## Published Web Component

[Hosted publication run 34692615632](https://github.com/nabilblk/h-sandbox/actions/runs/34692615632)
passed with `component=web`; chart publication was skipped. No local image build,
registry pruning, npm publication or tag replacement was performed.

Registry: `core.campus.clusterdiali.me/harakiri/harakiri-web`.
Tag: `docs-recovery-20260912-13de13ac37d5`.
Source: `13de13ac37d50ca21800a653a21fd814a9415241`.

| Manifest | SHA-256 digest |
| --- | --- |
| Multi-architecture index | `517a3f41cf5d1a48226ce2bb0e152e9d0a5443a5331b8298d9a47181c5300cf7` |
| Linux amd64 image | `0320d849d9a4ebac4eaa583f066d0ad264520bb34b091a7108ecbad8c7c3b7ef` |
| Linux arm64 image | `da5351fabb6cf7c01d387fa8e67a5c19287958f854746d99c6baebfa8e9cb463` |

Anonymous registry verification hashed index, child manifests and image configs;
architecture and source/version labels matched. This is not an OCI signing or
SBOM attestation claim. The web image retains rc.9 application-version metadata
but has its own immutable component identity.

The [optional web-only overlay](2026-09-12-standalone-recovery-docs-values.yaml)
supplements preserved operator values and the original rc.9 image overlay. It is
not a complete installation configuration. Render with the published rc.9 chart
and reject non-web changes before applying it. Public runtime origins must remain
explicit; build-time development fallbacks are not deployment configuration.

Read-only verification confirmed that the original rc.9 API/web versioned tags,
both chart digests and the attached `artifact-manifest.json` remained unchanged.
The manifest SHA-256 is still
`156519b7b1e5cce8a4c195e8904bffa30da087103ad89306c76443aa4b009e36`.
Both npm packages retain `next=0.5.0-rc.9` and `latest=0.4.0`.

## Public Lab Deployment

The populated arm64 lab moved from Helm revision 39 to 40 using the original,
checksum-verified rc.9 chart. Cluster and namespace UID guards selected the lab
explicitly; the machine's default CRC context was not used. A structured manifest
comparison accepted exactly one change: the `harakiri-web` container image.

Post-deployment comparison confirmed:

- Operator Secret data and the web runtime ConfigMap were unchanged.
- Public web/API/auth origins were unchanged, with no loopback URL in `/config.js`.
- All non-web deployment specifications and pod identities in the release
  namespace were unchanged. API, scheduler, template-builder and PostgreSQL
  were not rolled out. Keycloak and the runtime provider were not upgraded.
- The web Deployment was ready. Public API health and OIDC discovery returned
  200 with issuer `https://sb-auth.harakiri.io/realms/harakiri`.
- Browser sign-in presented the real Keycloak form, PKCE S256 and redirect origin
  `https://sb.harakiri.io`. This anonymous redirect check did not create a user or
  repeat an authenticated production workload.
- Live browser checks passed installation-to-recovery progression, search,
  section focus, highlighted code and exact Markdown exports. Screenshots at
  1440, 390 and 320 pixels showed no document overflow; small-screen code scrolls
  within its own block. No browser page errors were reported.

The temporary deployment helper initially failed while parsing multi-document
dry-run output. It made no cluster mutation. Switching to the existing structured
YAML parser allowed the exact web-only diff to pass before upgrade.

The web endpoint returned 502 at 12:06:56 UTC during the supervised port-forward
handoff, followed by five consecutive 200 responses from 12:07:02 through 12:07:22.
No manual tunnel/API/auth restart or workload mutation was used to recover it.
This is not zero-downtime evidence. The hosted lab still has no uptime SLA.
Only the owned verification browser was opened and closed; destructive native
tests remained on disposable GitHub runners.

## Remaining Limits

**The acceptance plan remains active.** Cross-release/schema rollback needs two
distinct, genuinely capacity-compatible published application releases. The
passing same-rc.9 Helm configuration rollback and this web-only image do not
satisfy that gate. Never reopen pre-capacity rc.8 writers against migration 038.

This qualification does not establish HA, arbitrary CSI support, full-cluster
disaster recovery, restricted OpenShift, live ambiguous inventory restoration,
external-secret-store recovery or LLM inference. Native OpenCode execution was
model-free. The fresh-install onboarding shortcut for the absent default Python
template is not covered; published CLI/SDK tasks used an imported OpenCode image.
Harbor physical disk/inode headroom remains an operator follow-up.

See the [technical qualification](../operations/standalone-recovery.md),
[active acceptance plan](../exec-plans/active/standalone-installation-and-recovery-acceptance.md)
and [original rc.9 delivery](0.5.0-rc.9-delivery.md). Original failures and narrower
earlier receipts are retained rather than rewritten as full acceptance claims.

# OSS Launch Review

September 9, 2026. **Source is public; anonymous access and repository protections verified.**
Initial baseline `3cac386fb4bc0ca2ef9c0f4ce9be8ab4141d75cb`. Reviewed changes are now
committed/pushed through `2e53944`; earlier candidates were retained immutably and
rc.8 with its separate `docs.2` web image is the delivered candidate. The
[execution plan](exec-plans/active/oss-developer-preview-launch.md) stays active
for notification handoff, announcement approval and post-launch adoption.

## Current Delivery Checkpoint

- The owner-authorized source-publication step is complete. Anonymous clone,
  all eight rc.8 release downloads/checksums and npm integrity passed after
  opening. Scoped credential rotation is verified; see the
  [launch receipt](release-notes/2026-09-09-public-launch.md).
  The 18 Vault rows were already erased tombstones, so no ciphertext required
  rewrapping. Identity persistence was corrected before restarting Keycloak. No
  social announcement has been posted. Repository description, homepage, topics
  and Discussions are configured. Private vulnerability reporting, secret scanning,
  push protection and dependency alerts are enabled. Main requires an up-to-date
  PR and eight checks, including for admins; publishing environments require
  owner review and accept only main. Owner email/Watch notification setup remains
  unverified, with the designated reporting email retained as a fallback.
- The final publication recheck fetched current remote heads/tags and scanned 939
  candidate files and 64 refs with no unresolved source/history findings. Remote
  inventory now covers six releases/26 assets, 206 Actions artifacts and 144
  runs. All 26 release assets, 150 non-expired artifacts and 90 available run
  archives were downloaded and reviewed. Fifty-six expired artifacts and 53
  unavailable run logs are excluded. The expanded content scan flagged
  21 occurrences of the source image tag `sha-792ac9c5f4bd`, including duplicate
  archive/extracted copies; each resolves to reviewed commit `792ac9c`. They are
  not authentication material. No remote logs/artifacts were deleted or blanket
  scanner exception added. Newly generated material still needs its own check.
- Owner-authorized points 1-3 cover safety, candidate delivery and isolated
  native verification. Independent evaluation is owner-confirmed complete.
  Those delivery results do not by themselves close the remaining safety items.
- SDK/CLI `0.5.0-rc.8` are published on `next`. Anonymous consumer installation and
  the exact CLI version post-publish check pass. `latest` remains `0.4.0`.
  Trusted npm CI publication was denied; a clean-tag, authenticated local publish
  is the verified fallback, not proof that unattended publishing works.
- Source CI for rc.8 and both docs corrections passed. The latest local CLI suite has 77 passing tests,
  including the new metadata-driven version check. Source/history scans remain
  clean. All 69 web tests pass, including standalone/Helm documentation serving
  and the current product-positioning checks.
  The candidate CI API suite has 315 passes and three conditional skips; the
  earlier fully migrated local database run covered those database cases. Do not
  describe candidate CI as a new zero-skip full-suite run. See the
  [delivery receipt](release-notes/0.5.0-rc.8-delivery.md) for exact artifacts.
- A separate k0s/arm64 cluster used fresh random operator/realm/runtime/database
  credentials. Native OpenCode template import, commands, files/artifacts,
  CLI execution, token-route fetch and denial, metrics, mutable egress and cleanup
  passed through published SDK/CLI. Fresh rc.7 application namespaces then
  upgraded to rc.8; the published rc.8 SDK conformance and retained-checkpoint
  reattachment passed. Public wildcard DNS/ingress is deliberately
  outside the loopback profile; protected API-proxied routes are the default.
- Workspace files survived the rc.4 to rc.5 upgrade. Both databases were then
  restored into new databases from a quiesced backup; the detached owned PVC was
  cleared and restored from its matching archive. SDK checkpoint reattachment,
  browser sign-in and workspace browsing passed. No sandbox pod exec was used.
  This does not certify HA/CSI disaster recovery or encrypted Vault-row recovery.
- The failed initial capacity attempt, missing optional `python` alias,
  unconfigured public wildcard route and stale CLI version were retained in
  evidence. Values, portable test commands, route guidance and CLI checks were
  corrected before final acceptance; successful reruns do not erase failures.
- The published CLI attached to a native PTY, executed a marker in `/workspace`
  and exited. OpenCode's advertised DeepSeek free model was unavailable; its
  zero CLI exit did not pass acceptance. `opencode/mimo-v2.5-free` corrected a
  seeded JavaScript defect; three original tests passed on independent rerun,
  with the acceptance file unchanged. This optional model run used rc.7.
- Full arm64 image scans found vulnerabilities outside the clean JavaScript
  audit. Distribution updates and unused-package removal eliminated all API npm
  findings and all web high/critical findings. The selected docs web image has five
  medium matches; API rc.8 has 211 distribution matches, including seven critical
  and 50 high, none high/critical with an available fix in that database.
  Scanner inventories and operator disposition remain distinct
  from a claim of no vulnerabilities. No blanket CVE suppression was added.
- The original rc.8 API/`docs.1` web image layers were exported and inspected:
  24 compressed layers, 15,058 regular files and 42.33 MB of scanned text. Six
  hits match the previously reviewed source/compiled fixture pairs, loopback
  smoke credential and V8 identifier. No usable secret was identified. Directory,
  link and device entries were recorded, not followed. One plaintext dpkg
  metadata file had a misleading `.gz` name; its private scan copy was renamed
  without changing bytes so archive detection completed without scanner errors.
- The lab now runs digest-pinned rc.8 API/worker images and the `docs.2` web
  correction. Public web/API/discovery return 200 with the correct issuer;
  35 hosted Markdown pages, JSON index, both LLM text indexes and missing-page
  404 checks pass. Desktop/mobile browser checks pass. Historical Nginx field
  ownership and a stale subPath mount needed scoped lab recovery; the fresh
  installation did not require these repairs. Secrets, SMTP and origins stayed
  unchanged in that earlier delivery. The later coordinated credential rotation
  and public-launch web deployment have their own receipt; do not restore old
  Helm secrets independently. The exact intervention sequences are retained.

The later scoped approval covered the human and recovery passwords, database,
runtime connection and Vault wrapping key. All replacements are verified and
delivered privately. The earlier private helper output exposure is remediated
for these credentials; no secret values belong in this receipt or release assets.
External receipt of the reporting inbox is still not claimed. GitHub's private
reporting entry point and repository protections are verified after opening;
maintainer notification delivery is the outstanding operator handoff. Residual
image advisories remain disclosed; no production risk waiver or
social announcement was issued.

The following sections retain the earlier investigation and its evidence;
current delivery status is maintained above and in the versioned receipts.

## Publication Safety

- Gitleaks 8.30.1 scanned 135 commits, 30 locally available refs and 904 tracked
  files with decoding/archive depth 2. Default rules found 13 fixture/metadata
  cases. The additional Harakiri-token rule found development seed and browser
  fixture cases missed by default rules. Narrow path-and-exact-value exceptions
  in `.gitleaks.toml` leave zero findings. A temporary Git index included all
  920 intended candidate files (including new source), without changing the
  real index or including `docs/cot/`; the candidate/history rescan also passed.
  A final fetch into `refs/oss-launch-audit/` covered the advertised remote
  branches/tags, including three missing dependency-update branch objects.
  The extended scan covered 138 reachable commits and 56 local refs, with zero
  findings. Existing local branches and tags were not moved.
- The documented development API key and browser fixture have no active match
  in the owned lab. This does not certify any other installation. A separate
  read-only check found a documented development **human administrator** still
  able to authenticate on the public lab. Following scoped owner approval on
  September 9, its password was replaced and its Keycloak sessions invalidated.
  Independent recovery and the same account/organization/role were verified.
  See the remediation receipt below; unrelated credentials were not rotated.
- Scanner results are private, redacted, mode-0600 evidence under ignored
  `docs/artifacts/`. The reusable checker inventories tracked files only and
  fails on scanner errors. Include intended new files in the index, or use a
  temporary index, before rescanning. No raw scan logs are uploaded by CI.
- Remote review subsequently downloaded all 18 release assets, all 101
  non-expired Actions artifacts and 65 available run logs. Gitleaks 8.30.1
  scanned their extracted/decoded contents with zero findings. Another 56
  artifacts were expired and 53 run logs returned HTTP 410; unavailable content
  is not claimed reviewed. No remote evidence was removed. The local review
  also covered 41 raster images and 261 frames sampled every five seconds from
  18 videos, with successful OCR and zero secret-scanner findings. Sampling does
  not inspect every frame. Selected candidate container-layer review is recorded
  in the current checkpoint above, separately from the historical source scan.
- Canonical Apache-2.0 license text and existing contributor copyright are
  retained in root and npm packages. [Third-party review](../THIRD_PARTY.md)
  identifies optional media/dependency terms still needing disposition.
- GitHub's `harbor` and `npm` environments now allow only the `main` branch.
  Required reviewers returned HTTP 422 because the current private repository
  plan does not support that protection. Do not describe this as independent
  approval. Trusted-main workflows validate source ancestry, package versions,
  release channel and artifact absence before entering publishing jobs.
  Harbor release secrets now contain a 90-day, project-scoped pull/push robot,
  not the registry administrator. Its expiry is December 8, 2026. Workflows pin
  action SHAs, use read-only PR permissions and disable persisted checkout
  credentials. Fork contribution checks must never receive shared cluster or
  publication secrets. Code alone cannot prove repository settings.
- The owner designated `nabilblk@gmail.com` for private security/conduct reports;
  the repository maintainer (`@nabilblk`) owns initial triage. SECURITY, the code
  of conduct and the public preview guide now expose the email route, without
  an SLA or a claim of tested delivery. Recipient acknowledgement is pending.
  GitHub private reporting is not advertised or enabled by this change.

## September 9 Credential Remediation

The owner approved the recommended replacement of the confirmed development
human administrator's password. The operation used the existing independent
Keycloak recovery administrator, preserving the target account and its data.

| Verification | Observed result |
| --- | --- |
| Password replacement | Strong random replacement stored outside the repository in an owner-only local file; no password or token printed or included in these docs |
| Sessions | Target user's online sessions invalidated; no offline sessions found before or after; no realm-wide logout |
| Old password | Token endpoint rejected it with `401 invalid_grant` |
| Old refresh token | Token endpoint rejected it with `400 invalid_grant` |
| Existing access token | API still returned `200` immediately after logout, then `401` after its recorded five-minute expiry, verified after 10:19:39 UTC |
| New credentials | `/v1/me` returned `200`, same user/organization and `admin` role |
| Browser | Public Keycloak login reached admin Settings; sign-out returned to the public landing page; temporary browser credential profile deleted and browser closed |
| Preservation | Stored identities, memberships, key hashes/revocation state and workspace IDs unchanged; realm, issuer, redirects and SMTP unchanged |
| Recovery | Separate recovery-admin login verified again after rotation; test sessions cleaned up |
| Public endpoints | Dashboard, API health and OIDC discovery returned `200`; issuer remained the public auth origin |

This resolves the confirmed live password exposure, not every possible incident
impact. Independently issued API keys, route tokens and prior actions require
their own review. Offline JWT validation is not immediate Keycloak logout
enforcement; the [operator procedure](authorization.md#exposed-human-credentials)
documents the boundary. No application release or deployment was performed.

The lab's existing SMTP configuration currently targets Mailpit, a local test
inbox, not SendGrid. No external contact-test message was sent and no SMTP
configuration was changed. This does **not** prevent a reporter emailing the
designated Gmail address directly; that reporting route is independent of the
application's invitation sender. A harmless message from an external mailbox
and the recipient's acknowledgement are still needed for the delivery receipt.

Follow-up source checks: all 67 web tests, web typecheck/build and the docs link
check pass. The exported preview Markdown preserves the actual `mailto:` link,
also verified through the local HTTP server. The earlier full-suite result
below remains the baseline, not a claim that all 572 tests were rerun here.

## Distribution Checks

The rc.4 Harakiri chart was downloaded without registry credentials. Helm
reported OCI digest `sha256:24fb7237f23c1b793fed9ffe97b770e65bd601ffc45469f342a45787803af9ad`,
matching the release receipt. An empty Docker credential directory could read
the API image's amd64/arm64 manifest. Both rc.4 npm packages downloaded directly
without authentication, matched their published SHA-512 integrity and included
licenses; SDK/CLI archives contained 15/24 files and no source/tests/scripts/env
files. This is not an image-layer pull or fresh native installation receipt.
The repository and its GitHub release assets remain private. The completed,
paginated remote inventory covers five releases, 18 assets, 157 Actions
artifacts and 118 workflow runs; the available-content audit is described above.
No registry mirror, source visibility or stable npm tag was changed.

## Implemented and Verified

- Removed fabricated historical usage, peaks and duration estimates. Added
  availability metadata while retaining deprecated numeric wire types; the
  dashboard shows unavailable history rather than plotting placeholders.
- Labeled concurrency as an unenforced target. Commands now default to runtime
  working-directory metadata, preserve edits, and reset for a different sandbox.
- Generated all 35 documentation pages, language variants and indexes from the
  existing page inventory. README, quickstart and package guides distinguish
  the pinned rc.4 preview from older stable packages and unreleased source.
- Corrected contributor commands, pinned Actions, added redacted scanner and
  browser CI jobs, and retained the existing npm/Docker/Actions dependency bots.
- The original production dependency audit reported 28 advisories, including
  18 high. Compatible updates, bounded transitive security floors and a patched
  optional image-processing dependency clear the final full audit: zero known
  advisories across the resolved 546-package dependency inventory. This is not
  a vulnerability-free guarantee or an audit of deployed image layers.
- A clean candidate checkout on macOS/arm64 used a new HOME, new pnpm store and
  empty npm config, with no inherited cluster, model-provider or service secrets.
  Frozen install, build, types, OpenAPI, docs, Vault boundary, executable examples
  and packed SDK/CLI consumer installation passed.
- Disposable loopback PostgreSQL ran the migrations and all 572 unit/integration
  tests with zero failures or skips, including authorization, workspace and
  lease database tests. Packed SDK/CLI dev-provider conformance passed; the
  database was stopped. These are not native OpenSandbox acceptance results.

The clean test setup initially needed normal source-file permissions and an
explicit database locale. Neither issue was hidden by relaxing product tests.
Private logs retain the failed attempts and successful reruns.

- All 20 Playwright docs/authorization/preview tests passed on a separately
  allocated local port, including 1440/390/320-pixel layouts, language tabs,
  exact code copying, search and keyboard navigation. Desktop/mobile screenshots
  were also inspected through `agent-browser`; no page overflow was found.
- Local Nginx 1.31.5 validated the repository server config with only its listen
  address and static root substituted. All 35 Markdown pages and both LLM indexes
  returned byte-exact content and correct MIME types; a missing page returned
  404 rather than the SPA shell. This is not a deployed nginx:1.29 image test.
- Exporter regression verification removed an obsolete generated page while
  preserving the current inventory. No maintained source page was deleted.
- Read-only public checks returned 200 for the dashboard, API health and OIDC
  discovery, with the correct public Keycloak issuer. No deployment was performed.

Relevant upstream advisories: [Fastify validation](https://github.com/fastify/fastify/security/advisories/GHSA-w2qp-rph6-63g4),
[Vite filesystem boundary](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff),
[Sharp/libheif](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).
Remove each transitive override when the dependency tree resolves outside its
affected range without it, and rerun the audit/tests. No advisory is suppressed.

## Release and Support Handoff

Before source opening, the owner must approve the intended refs/media, complete
remote-artifact review, verify the designated private reporting route and
configure release protection. The confirmed development administrator has been
remediated; do not reopen that item without new evidence. Preserve immutable release
tags; any required history cleanup needs an explicit coordinated proposal.

Before recommending the preview, produce a new immutable candidate containing
the source corrections, one full bill of materials and an SBOM/vulnerability
disposition. Run clean install, upgrade, retained-file recovery and uninstall
with operator-owned configuration. Preserve public OIDC origins and SMTP on
the lab; deployment is a separate approved action.

The owner confirmed independent evaluation complete on September 9. Treat that
as owner-reported acceptance, without inventing an environment, tested version,
intervention count or endorsement. Do not require repeating that evaluation.
Track three consented teams and actual second-week use or reasons for stopping
after launch. This follow-up is not a prerequisite to opening the source.

For an incident: pause promotion, preserve evidence privately, assess affected
versions and credentials, coordinate remediation, verify denial/recovery, then
publish a sanitized advisory through the confirmed reporting process. Reversing
repository visibility cannot recall forks or downloaded material.

Sources: [GitHub visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility),
[removing sensitive material](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository),
[Actions security](https://docs.github.com/en/actions/reference/security/secure-use),
[Gitleaks configuration](https://github.com/gitleaks/gitleaks#configuration),
[canonical Apache license](https://www.apache.org/licenses/LICENSE-2.0.txt).

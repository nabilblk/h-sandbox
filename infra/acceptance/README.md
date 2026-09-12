# Standalone Installation and Recovery Acceptance

This is a qualification harness, not a second installer. It consumes the public
reference configuration, published chart archives, immutable application image
digests and integrity-checked npm tarballs pinned in `versions.json`.

**Current evidence: all seven configured native gates and cleanup passed in
[run 34659892741](https://github.com/nabilblk/h-sandbox/actions/runs/34659892741).**
This includes real OIDC, published CLI/SDK tasks, admission, routes, retained files,
coordinated encrypted recovery, missing/wrong-key rejection, provider interruption,
state rehydration, configuration rollback and revocation. The
[receipt is retained in Git](../../docs/operations/evidence/standalone-34659892741.json).
Distinct-release/schema rollback remains untested. See
[PR 42](https://github.com/nabilblk/h-sandbox/pull/42); no new release or deployment
is implied. Local contracts alone are not native acceptance evidence.

## Isolation

The destructive entry points run only on a Linux/x64 **GitHub-hosted** runner.
They refuse macOS, ARM, self-hosted runners, inherited kubeconfigs, existing k0s
state and occupied test ports. Every subsequent cluster operation checks a
private kubeconfig, cluster UID and a unique run ownership label.

The runner gets a fresh single-node k0s installation. It does not use Docker,
Lima, a local cluster, Cloudflare, the public lab or customer credentials. A
second namespace in an existing cluster is not sufficient isolation for the
provider's controllers and CRDs. No cluster-wide resources are installed on the
maintainer's machine.

The workflow has read-only repository permissions, no deployment environment,
no publishing permissions and no repository secrets. Same-repository PR runs
are permitted; fork PRs do not start this expensive native fixture. Runs are
serialized and bounded to 75 minutes.

## Gates

| Gate | Required proof |
| --- | --- |
| Installation | Fresh native amd64 node; published artifact identities; web/API/OIDC reachability; exact issuer |
| Identity | Real browser authorization code/S256 PKCE, onboarding, generated scoped key, persisted organization settings |
| First task | Published CLI and SDK, model-free OpenCode, x86_64 execution, file integrity, protected route denial, admission denial, idempotent creation, second-runtime workspace reuse |
| Encrypted recovery | Both databases dumped while writers are stopped; restored onto a new PostgreSQL PVC; source PostgreSQL stopped; workspace restored to an empty replacement PVC; original identity and API key retained |
| Key recovery | Real `envelope-v1` source; missing and wrong wrapping keys reject attachment; ciphertext unchanged; correct key restores actual proxy injection |
| Interruption | Provider control API unavailable while a runtime survives; restarted Harakiri retains its execution/storage ownership; a detached command is not duplicated |
| Provider state loss | Only the owned Vault credential/binding is removed through the provider API; inspection detects absence; explicit Harakiri rehydration restores credential use |
| Configuration rollback | A real Helm CPU-request change and rollback retain workspace state, encrypted credentials and admission |
| Revocation/cleanup | API key becomes unusable; browser logout ends SSO; owned runtime namespace removed before controller namespace; private evidence removed |

The credential fixture uses the public [Postman authentication test endpoint](https://www.postman.com/postman/postman-public-workspace/request/rg6swaa/basic-auth-success)
and its published example credential, not a Postman account or production secret.
It matches Harakiri's HTTPS-only custom profiles without disabling certificate
verification. A sandbox sends an invalid placeholder: the test requires 401
before attachment and 200 only after injection. The source is genuinely encrypted
in PostgreSQL and subjected to the same missing/wrong-key recovery tests.
Only the HTTP status is returned to the test, not reflected request headers.
This introduces an external availability dependency; an outage fails acceptance,
not passes the negative case. No model account or paid inference is required.
The missing-key case supplies an explicitly empty Vault key: deleting that env
variable alone would enable the legacy control-plane-key fallback. Unrelated
encryption keys remain unchanged in both negative cases.

## Run

Low-cost, cluster-free local checks:

```bash
node --test infra/acceptance/*.test.mjs infra/preview/configure.test.mjs
```

After the workflow is reviewed and available on the repository default branch:

```bash
gh workflow run standalone-acceptance.yml --repo nabilblk/h-sandbox --ref main
gh run list --repo nabilblk/h-sandbox --workflow standalone-acceptance.yml
gh run watch RUN_ID --repo nabilblk/h-sandbox --exit-status
gh run download RUN_ID --repo nabilblk/h-sandbox --name standalone-acceptance-RUN_ID-1
```

Replace the run ID and attempt number with the actual run. A reviewed
same-repository PR touching this harness or the reference configuration also
starts the native job. Never spoof runner environment variables to execute
these entry points on a shared Linux host.

## Evidence and Secrets

Only `standalone-acceptance-report.json` is uploaded. Its evidence fields are
allowlisted booleans and hashes; it distinguishes application source from harness
source and includes the owned cluster UID. Failed gates stay failed. The
receipt's `cleanup.status` is separate from application assertions.
Failure diagnostics contain only pod readiness, counts and allowlisted reasons,
operation states and known platform error categories, not environment variables,
annotations, request payloads or raw error messages.
Bounded first-runtime snapshots preserve pod/workload progress before provider
rollback removes failed resources. A nonzero main-container exit fails the test
promptly, without pretending that a longer readiness wait will repair it. The
180-second timeout experiment also failed and was removed: the main container
exited before readiness while the egress sidecar became healthy.
Run 34658393120 captured exit 255 with `exec_format_error`. Anonymous OCI
inspection then confirmed that the original template digest was ARM64-only.
The corrected digest is the AMD64 child of the already published catalog index
`sha256:089f32fa775f6b5865a277da8bd00a2dc1d2784e55eb27a7072e22cf2ea1577b`.
The harness verifies manifest/config checksums and requires `linux/amd64`;
image-pull success alone does not establish executable architecture. No image
was built or published to correct this fixture error.

Backups, Kubernetes Secrets, credentials, Helm values, raw subprocess output and
browser state are private runner material, **not** public build artifacts.
Permissions `0700`/`0600` do not encrypt a backup. This fixture deliberately has
no durable production backup retention; its private directory and hosted VM are
discarded. Use an approved encrypted backup system for real installations.

After a failure, reproduce on a fresh runner. Never remove validation to obtain
a green run, upload the private directory to debug it, or repeat an ambiguous
sandbox command. The harness fails below its disk-headroom thresholds instead
of pruning a shared registry or Docker daemon.

## What a Green Run Does Not Mean

- Distinct-release or schema rollback has been certified. The current test
  changes Helm configuration **within rc.9**. `releaseCompatibility` remains
  `not_tested` until a distinct compatible published pair is selected and run.
  Pre-capacity rc.8 is not a safe rollback target after migration 038.
- A 4-CPU hosted runner is the production sizing recommendation. It is a bounded
  single-runtime acceptance fixture, not a performance benchmark.
- Restricted OpenShift, HA, CSI snapshots, full cluster disaster recovery,
  air-gapped installation, production ingress or external secret-provider
  recovery has passed. The profile uses local-path storage and privileged native
  egress enforcement in its own cluster.
- Every onboarding button was tested. The reference starts with an empty
  template catalog. The test creates/revokes the onboarding key, opens the
  dashboard, imports OpenCode, then runs the actual first task through CLI/SDK.
  The hardcoded Python onboarding task is not exercised by this sequence.
- Automatic background rehydration or byte-for-byte process restoration was
  proven. State-loss recovery invokes the explicit Harakiri API; retained files
  are not a process snapshot.
- File-keyring rotation, KMS/HSM or external secret-store recovery was exercised.
  This fixture uses one environment-provided wrapping key and a nonempty
  `envelope-v1` source containing a public example credential. It is not proof of
  private-CA trust distribution or a nonpublic upstream service.

See [the coordinated recovery runbook](../../docs/operations/standalone-recovery.md)
and [the native reference installation](../preview/README.md).

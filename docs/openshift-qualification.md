# Restricted OpenShift Qualification

Status: **not run**. Local Helm/API tests are not native acceptance. Use only an
explicitly approved isolated cluster; never infer approval from a current context.
The [installation guide](install-openshift.md) defines the client-test preview and
artifact boundaries.

## Record the Target

Keep the generated `qualification.json`, configuration/input checksum, reviewed
Git SHA, image/index and chart digests, preflight and SDK smoke receipts. Record:

- OpenShift version, node architecture, CRI-O version and CNI.
- Namespace, tested quotas, node capacity and admission policy.
- Actual `openshift.io/scc` annotations on control-plane, runtime, init and sandbox
  Pods; assigned UID/GID/SELinux context. No default SCC was changed.
- Registry CA/pull path, browser origins/certificate and dependency versions.
- Storage remains disabled in this baseline. Do not invent a StorageClass result.

Do not include credentials, bearer URLs, kubeconfig, application file contents or
raw logs in a public receipt. Record resource IDs only when safe for the audience.

## Required Checks

| Gate | Evidence needed |
| --- | --- |
| Fresh install | Apply reviewed network policies/resources and both charts; no patch, host mount, elevated SCC or fixed UID |
| Actual admission | Inspect generated sandbox and init containers, not just Deployments; non-root execution with no API token mounted |
| Login | Public issuer/audience, first workspace setup, regular member/admin separation, token refresh and real logout |
| API smoke | `verify.mjs` passes capabilities, readiness, non-root command, 1 MiB binary roundtrip and confirmed owned deletion |
| Terminal | Type a command, resize, reconnect and observe exit through the UI and CLI; do not substitute `oc exec` |
| Workbench | Upload/read/download, preview a text file and inspect command state; no cross-sandbox file access |
| Protected service | Start a deterministic HTTP server in a sandbox through Harakiri, access with the intended grant, deny anonymous/expired/wrong-sandbox credentials, close and terminate |
| Unsupported operations | Attempt non-open policy, Vault attachment, snapshot, restore, pause/resume and workspace use; reject with actionable errors, no extra Pod/sidecar/admission reservation |
| Network isolation | From the sandbox through Harakiri commands, prove denial to another sandbox, control plane, runtime server, API server, DB and metadata endpoints. Prove approved DNS/HTTPS behavior separately. Do not test with real credentials. |
| Trust | Private CA works with TLS validation enabled; wrong/absent CA fails. No insecure TLS switches. |
| Failure and cleanup | Wrong template/UID, quota pressure, provider outage and stream interruption fail truthfully; accepted IDs retained; no leaked runtimes/capacity after reconciliation |
| Restart and recovery | Control-plane replacement preserves public origins; isolated DB+key restore works; release-specific migration and rollback limits recorded |

Account for other cluster policies: additive allows, host-network ingress routers
and node-local DNS may change the effective boundary. Test the actual router and
DNS topology. Quota exhaustion, provider interruption and recovery tests require
explicit scheduling and a disposable target; do not conduct them on a customer
or developer's live workload.

## Completion Rule

Update the receipt only from observed results, with date, reviewer, commands and
sanitized evidence locations. Mark a gate passed, failed or not run. A pass in
one cluster qualifies only that exact version/architecture/security/runtime
profile, not all OpenShift versions. Release the matching source chart and
API/web images together before changing the public guide from candidate to
supported. Keep failed or unrun gates visible.

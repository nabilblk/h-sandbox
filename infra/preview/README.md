# Native Kubernetes Evaluation

For the complete reader-facing journey, use
[Install on Kubernetes](../../docs/install-kubernetes.md), also available under
**Self-hosting** in the [public docs](https://sb.harakiri.io/#docs/install-kubernetes).
This file maintains the underlying reference profile and its operator commands.

This reference profile installs Harakiri and OpenSandbox in an **empty,
operator-owned Kubernetes cluster**. Do not install a second OpenSandbox
controller in the populated lab: its CRDs and controller permissions are
cluster-wide. This is a trusted-team developer preview, not a hardened hostile
multi-tenant or restricted OpenShift profile.

The configuration helper creates files only. Installation uses ordinary
`kubectl` and `helm` commands, with no rollout-repair script or SCC changes.

## Profile

| Component | Selected version or requirement |
| --- | --- |
| Reference node | Linux/arm64, k0s `v1.36.3+k0s.2`, Ubuntu 24.04, 8 CPUs / 16 GiB RAM / 80 GiB disk; separate native amd64 hosted-runner evidence below |
| Storage | `local-path` default StorageClass; single-node evaluation, not highly available storage |
| Database | PostgreSQL `16.15-alpine`, separate Harakiri and Keycloak roles/databases |
| Identity | Keycloak `26.7.3`, browser PKCE, explicit API audience, operator-owned credentials |
| Runtime chart | `opensandbox:0.2.2-harakiri.2` from Harbor |
| Runtime images | server `v0.2.3`, controller `v0.2.0`, execd `v1.1.0`, ingress `v1.0.10`, egress `v1.1.7` |
| Control plane and packages | `0.5.0-rc.9`; npm channel `next`, never implicit `latest` |
| Web | Matching `0.5.0-rc.9` image; no older documentation overlay |
| Scope | Persistent files, commands, files/artifacts, scoped authorization and native egress |

The listed hardware is a reference allocation, not a measured minimum or a
concurrency guarantee. Image builds and larger agents require additional space
and memory. The release receipt, not this configuration table, establishes which
acceptance tests have passed. An arm64 test does not certify amd64 execution;
the [isolated acceptance record](../../docs/operations/standalone-recovery.md)
now includes actual amd64 tasks and encrypted recovery.

Use the [rc.9 release notes](../../docs/release-notes/0.5.0-rc.9.md) and attached
artifact receipt. The chart selects matching versioned API/web images. Earlier
rc.8 artifacts remain immutable; do not apply their image overlays to rc.9.

This single-user evaluation runs one lifecycle server (256 MiB request / 1 GiB
limit) and one gateway (128 MiB request / 512 MiB limit). The upstream defaults
reserve 12 GiB for these services alone and leave insufficient room for a 4 GiB
OpenCode sandbox on the reference node. These overrides are not production
capacity recommendations; load-test and resize before increasing concurrency.

## 1. Select the Empty Cluster

Use an explicit kubeconfig for every command. On an existing empty Kubernetes
cluster, supply its kubeconfig and a tested default StorageClass. Cluster-admin
access is required for OpenSandbox CRDs and roles.

For a separate local macOS/Apple Silicon fixture:

```bash
export K0S_LIMA_VM=harakiri-preview-rc5
export K0S_LIMA_CONFIG="$PWD/infra/k0s/lima-preview.yaml"
export K0S_KUBECONFIG="$HOME/.config/harakiri/preview.kubeconfig"
export K0S_API_PORT=16444
bash infra/k0s/bootstrap.sh
export KUBECONFIG="$K0S_KUBECONFIG"
kubectl get nodes -o wide
kubectl get storageclass
```

This fixture does not reuse `infra/k0s/harakiri.kubeconfig` or port 6444. Its
cluster version is pinned. Do not stop, resize or reset the existing lab VM.

## 2. Create Operator Configuration

Requires Node 22 or newer. The default origins are loopback-only port forwards.
For an ingress installation, set all three `PREVIEW_*_ORIGIN` variables to HTTPS
origins without trailing slashes, provision matching ingress/TLS separately,
and review the chart's ingress configuration before proceeding.

```bash
export PREVIEW_OPERATOR_EMAIL=operator@example.test
node infra/preview/configure.mjs
```

`infra/preview/.private/` is mode 0700; files are 0600 and ignored by Git. The
helper refuses to overwrite an existing directory. It generates random database,
runtime, encryption, realm-service and human passwords. No secret is printed.

- `operator-login.json`: initial Harakiri user, for browser login.
- `recovery-login.json`: independent Keycloak master recovery administrator.
- `secrets.json`: Kubernetes Secrets, including the initial realm import.
- `harakiri-values.json`: non-secret chart values and existing-Secret references.
- `opensandbox-values.json`: runtime configuration, including its API key.

Protect **all** these files and your kubeconfig. The upstream runtime chart
stores its TOML in a ConfigMap and Helm release metadata, so namespace read
access is privileged. Do not expose the OpenSandbox lifecycle endpoint or
share `helm get values/all` output. Restrict cluster API access accordingly.

The API receives a realm-scoped service account, not the master administrator's
password. Browser direct-access password grants, self-registration and reset
email are disabled in this reference realm. Configure a real SMTP sender and
the required identity policies before enabling invitation/reset workflows.

## 3. Install Dependencies

```bash
kubectl apply -f infra/preview/dependencies.yaml
kubectl apply -f infra/preview/.private/secrets.json
kubectl -n harakiri-preview rollout status deployment/preview-postgres --timeout=5m
kubectl -n harakiri-preview rollout status deployment/preview-keycloak --timeout=10m
```

PostgreSQL initializes the two databases only when its volume is empty. Never
regenerate passwords during an upgrade: changing a Secret does not change an
existing database role. Keycloak similarly skips import of an existing realm.

## 4. Download and Install the Runtime Chart

```bash
mkdir -p preview-charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox \
  --version 0.2.2-harakiri.2 --destination preview-charts
helm pull oci://core.campus.clusterdiali.me/harakiri/charts/harakiri \
  --version 0.5.0-rc.9 --destination preview-charts
helm install preview-runtime preview-charts/opensandbox-0.2.2-harakiri.2.tgz \
  --namespace harakiri-preview \
  -f infra/preview/.private/opensandbox-values.json --wait --timeout 10m
```

The runtime chart's expected OCI digest is
`sha256:b93f51554b26364f09f839e6b4f95eeb6ba799edecee9cb1f6de421207d04a34`.
Compare the control-plane chart to its release receipt. No Harbor login is
required for anonymous reads. The downloaded archive is the installation input;
do not modify or rebuild the chart locally.

The configuration explicitly overrides **both** subchart namespaces. The
upstream default is `opensandbox-system`, not the Helm release namespace.
The lifecycle server listens on 8080; its in-cluster Service still uses port 80.
Native `dns+nft` enforcement requires runtime network privileges unavailable
under an unmodified restricted OpenShift SCC. Do not bypass that restriction.

## 5. Install Harakiri

```bash
helm install harakiri preview-charts/harakiri-0.5.0-rc.9.tgz \
  --namespace harakiri-preview \
  -f infra/preview/.private/harakiri-values.json --wait --timeout 10m
kubectl -n harakiri-preview get pods
```

The image imports/catalog path is enabled. The reference profile does not
provide a registry writer or claim Dockerfile build acceptance; configure a
project-scoped registry identity before testing that separate workflow.

In three terminals, keep these loopback forwards running:

```bash
kubectl -n harakiri-preview port-forward --address=127.0.0.1 svc/harakiri-web 28480:80
kubectl -n harakiri-preview port-forward --address=127.0.0.1 svc/harakiri-api 28482:8080
kubectl -n harakiri-preview port-forward --address=127.0.0.1 svc/preview-keycloak 28484:8080
```

Open `http://127.0.0.1:28480`. Use the generated operator login, complete
onboarding, and create a scoped, expiring key. Confirm OIDC discovery returns
`http://127.0.0.1:28484/realms/harakiri`, not the internal Service address.
These addresses belong only to this local fixture; never deploy these values
to `sb.harakiri.io` or a customer's public installation.

## 6. Prove a Real Workflow

Install exact published packages into a clean consumer directory:

```bash
npm install --save-exact @h-sandbox/sdk@0.5.0-rc.9
npm install --global @h-sandbox/cli@0.5.0-rc.9
harakiri --version
export HARAKIRI_API_URL=http://127.0.0.1:28482
harakiri login --help
```

Configure your own key following the [CLI guide](../../docs/cli.md); do not
paste it into shell history, screenshots or issue reports. Import the exact
OpenCode image digest from the release receipt using template image builds.
Follow [template documentation](../../examples/templates/opencode/README.md)
and [workspace operations](../../docs/persistent-workspace-operations.md).

Acceptance must demonstrate: a real native sandbox, deterministic command exit
and output, file/artifact integrity, termination and workspace reattachment,
read-only key denial and revoked-key denial, plus cleanup of owned resources.
Run OpenCode's no-model smoke before optionally selecting a currently available
free model. A model call alone is not a correctness test of its output.

Protected routes (`harakiri expose SANDBOX_ID --port 3000 --access token`) use
the Harakiri API proxy and work through these forwards. Public wildcard routes
need a separately configured ingress/gateway and wildcard DNS; this loopback
profile does not provide either. Its default is protected access. Do not send a
private route token to an unrelated host when testing a forwarded URL.

## 7. Upgrade, Recovery and Cleanup

For an upgrade, preserve the generated configuration and take a coordinated
backup first. Quiesce API writes, terminate/release test sandboxes through
Harakiri, stop scheduler/builder workers, and follow the selected release's
migration order. Use the downloaded candidate chart with `helm upgrade` and the
same values and versioned artifact overlay; do not regenerate credentials or
replace origins. `kubectl port-forward` connections end when their selected pod
is replaced. Restart the three forwarding commands after the upgrade and check
their local health endpoints before running the acceptance workflow. This is a
local access step, not a deployment repair or runtime fallback.

Recovery needs both PostgreSQL databases, operator Secrets/Vault keys and the
workspace volumes from the same quiesced point. A successful `pg_dump` alone
does not back up agent-written files. Restore into a disposable target before
claiming recovery works; verify login, metadata, retained files and encryption.
See the [storage recovery procedure](../../docs/persistent-workspace-operations.md).
The [coordinated recovery runbook](../../docs/operations/standalone-recovery.md)
covers identity, encrypted Vault sources, workspace storage, missing-key tests
and upgrade boundaries together. The new [isolated amd64 acceptance harness](../acceptance/README.md)
has passed fresh native installation, OIDC, CLI/SDK tasks, coordinated
encrypted recovery, provider-state rehydration, configuration rollback and
revocation, with a retained sanitized receipt. A green
configuration-rollback test is not cross-release/schema compatibility evidence.

Before installing any build containing migration 038, follow the
[capacity maintenance runbook](../../docs/operations/execution-capacity.md).
Published rc.8 predates that protocol and is not a compatible rollback target.
The [September 11 isolated rehearsal](../../docs/operations/execution-capacity-install-acceptance.md)
records migration and compatible-image rollback, along with a cold-start failure:
the first file request briefly returned 502 after lifecycle status became running.
The rc.9 API and SDK gate the first task on execution-service health. Retain
the accepted sandbox ID on timeout and continue its readiness wait; do not
blindly repeat sandbox creation or a command with an unknown outcome. See the
[readiness contract and native evidence](../../docs/operations/execution-readiness.md).

After evidence and backups are secured, remove only this fixture's releases:

```bash
helm uninstall harakiri --namespace harakiri-preview --wait
helm uninstall preview-runtime --namespace harakiri-preview --wait
kubectl -n harakiri-preview-runtime get pvc
kubectl -n harakiri-preview get pvc
```

Helm keeps OpenSandbox CRDs by policy; do not delete shared CRDs in another
cluster. PVC deletion/namespace deletion can destroy retained data. In this
disposable VM only, after explicitly approving loss of its test data, stop and
delete **the named fixture**:

```bash
limactl stop harakiri-preview-rc5
limactl delete harakiri-preview-rc5
```

Remove its private files/kubeconfig only after confirming the intended backup
retention. Do not run cleanup against the lab or a customer context.

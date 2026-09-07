# Single-Namespace OpenShift Installation

Canonical staged package for `harakiri-security`. No default SCC changes,
source-chart fallback, post-install patches or restart-to-repair commands.
Credentials and rendered manifests remain in a private ignored state folder.

**Status, 2026-09-07:** artifact preparation and unit checks passed. The maintained
OpenSandbox chart was published to Harbor. Fresh installation of this revised
package has not yet passed CRC acceptance: the existing namespace contains data
and has not been removed. June evidence does not validate September versions.

## 1. Prepare Access and Artifacts

Required workstation tools: Node.js 22.16+, `oc`, Helm 3, `envsubst`, Docker
registry login and a registry-copy tool such as `skopeo`. Log in yourself; the
package never embeds cluster passwords or performs an implicit cluster login.

```bash
oc login https://api.your-cluster.example.com:6443
oc whoami
docker login core.campus.clusterdiali.me
cd OCP-install/harakiri-security
```

For customer installation, copy the required images into their registry first,
preserving all architectures. The lab defaults use our Harbor as the customer
registry.

```bash
skopeo login core.campus.clusterdiali.me
skopeo login registry.customer.example.com
skopeo copy --all \
  docker://core.campus.clusterdiali.me/harakiri/harakiri-api:0.4.0 \
  docker://registry.customer.example.com/harakiri/harakiri-api:0.4.0
```

Repeat for the exact image set below and retain manifest digests in the handoff.
Mirror charts using `helm pull` then `helm push`. Trust the customer CA instead
of disabling TLS globally.

| Artifact | Default under `core.campus.clusterdiali.me/harakiri/` |
| --- | --- |
| API, scheduler, template builder | `harakiri-api:0.4.0` |
| Web | `harakiri-web:0.4.0` |
| PostgreSQL, arbitrary-UID compatible | `mirror/postgresql-16:c9s-20260907` |
| Keycloak | `mirror/keycloak:26.4` |
| OpenSandbox server | `mirror/opensandbox/server:v0.2.3` |
| Controller | `mirror/opensandbox/controller:v0.2.0` |
| Gateway | `mirror/opensandbox/ingress:v1.0.10` |
| Execution daemon | `mirror/opensandbox/execd:v1.1.0` |
| Optional BackgroundAgent | `background-agents/harakiri-web:0.1.0` |
| Agent runtime template | `templates/open-agents-dev:<tested-tag-or-digest>` |

Additional optional feature images are in
[`images.txt`](../../infra/mirror/images.txt). Mirroring egress/image-committer
does not imply those features work under restricted-v2.

| Chart | OCI coordinate | Version |
| --- | --- | --- |
| OpenSandbox | `oci://core.campus.clusterdiali.me/harakiri/charts/opensandbox` | `0.2.2-harakiri.2` |
| Harakiri | `oci://core.campus.clusterdiali.me/harakiri/charts/harakiri` | `0.4.0` |
| BackgroundAgent, optional | `oci://core.campus.clusterdiali.me/harakiri/background-agents/charts/harakiri` | `0.1.0` |

Upstream chart 0.2.2 hardcodes container port 80. Our maintained distribution
exposes that setting; this package sets both container and TOML server port 8080.
The Service may still expose 80. See the [distribution notes](../../infra/charts/opensandbox/HARAKIRI.md).

## 2. Download and Review Locally

Use environment variables, or `INSTALL_ENV_FILE` pointing to a private dotenv
file (chmod 600). Do not commit credentials. Defaults target CRC.

```bash
export NAMESPACE=harakiri-security
export CLIENT_REGISTRY_URL=https://core.campus.clusterdiali.me
export HARBOR_PROJECT=harakiri
export APPS=apps-crc.testing
export INSTALL_BACKGROUND_AGENT=true
export INSTALL_STATE_DIR="$PWD/state/$NAMESPACE"
./install.sh prepare
```

For customers, set `WEB_HOST`, `API_HOST`, `AUTH_HOST`,
`BACKGROUND_AGENT_HOST` and `SBX_DOMAIN` before first prepare.
Version overrides: `SANDBOX_CHART_VERSION`, `SANDBOX_IMAGE_TAG`,
`OPEN_SANDBOX_CHART_VERSION`, `BACKGROUND_AGENT_CHART_VERSION`,
`BACKGROUND_AGENT_IMAGE_TAG`. Published 0.4.0 does **not** contain Phase 2B.

Preparation changes no cluster resource. It downloads local chart archives into
`state/<namespace>/charts/{opensandbox,sandbox,background}/`, records archive
SHA-256 in `charts.lock.json`, renders YAML/values, and generates stable private
credentials, Secret-based realm imports and SQL. The first download establishes
a local lock, not signature/provenance verification; compare release evidence.

Reruns reuse saved `config.json`, not changed environment values, and check
archive hashes. Use a distinct state directory for a distinct installation.
Securely back up state/encryption keys. Do not regenerate credentials to recover
a running database or encrypted Vault.

Optional first login: set `BOOTSTRAP_USER_EMAIL` and `BOOTSTRAP_USER_PASSWORD`
together before prepare. The password is temporary. Otherwise create the first
user in Keycloak. Configure and test approved SMTP settings separately.

BackgroundAgent is optional. `BACKGROUND_AGENT_WORKSPACE=/path/to/background-agents`
can reuse known development env values but is not required. Missing GitHub,
model, Redis or application secrets remain blank; complete them before claiming
application acceptance. Review OAuth callbacks and email allowlists.

## 3. Install Dependencies

```bash
./install.sh dependencies
```

One PostgreSQL service/database, distinct service roles/schemas, Keycloak's
Harakiri realm and optional BackgroundAgent realm. Admin bootstrap SQL installs
pgcrypto; application roles are not superusers. Realm credentials are Secrets,
not ConfigMaps. Public application clients use PKCE S256 and no password grant.

The namespace must be new/empty or owned by this prepared installation.
Existing deployments/PVCs with another or missing installation identity cause a
refusal. Do not bypass this guard to adopt live data. A namespace-only customer
operator still needs platform approval for namespace ownership, OpenSandbox
CRDs and cluster-scoped RBAC.

## 4. Install OpenSandbox, Then Harakiri

```bash
./install.sh opensandbox
./install.sh sandbox
```

Helm uses the local archives and waits for readiness. Harakiri's stage applies
Routes. No SCC is created, edited or granted. Restricted-v2 supports the
open-network baseline; NET_ADMIN egress and Credential Vault sidecars require an
approved runtime profile. Dockerfile builds are disabled; import built images.

Seed data is disabled. Sign in, onboard, create an API key and import a template:

```bash
export HARAKIRI_API_URL=https://hs-api.apps-crc.testing
export HARAKIRI_API_KEY=hk_live_...
export TEMPLATE_IMAGE='core.campus.clusterdiali.me/harakiri/templates/open-agents-dev@sha256:<verified-digest>'
harakiri template build --name open-agents-dev --source image \
  --image "$TEMPLATE_IMAGE" ../../examples/templates/open-agents-dev --timeout 900
harakiri template smoke open-agents-dev \
  --context ../../examples/templates/open-agents-dev \
  --cmd harakiri-open-agents-smoke --timeout-ms 180000 --wait-timeout-ms 120000
```

Historical June validated image, not a September rebuild:
`core.campus.clusterdiali.me/harakiri/templates/open-agents-dev@sha256:fd71e2b7610f81260755ccb86ee60a119ce14816016a4870ef9820a8b4255070`.
For new artifacts see [template publication](../../docs/template-release.md).

## 5. Install BackgroundAgent

```bash
./install.sh background-agent
```

Before this stage, set `HARAKIRI_API_KEY` in your private `INSTALL_ENV_FILE`.
The stage validates and applies it to only `background-agent-secrets`, and saves
it in private installation state without rotating any other credentials.
Do not paste it into a command line or commit it. Review the prepared
`background-agent-secrets` Secret. Review its image/realm/client settings.
The configured provider is Harakiri, using `open-agents-dev`.
The installer does not modify BackgroundAgent source.

## 6. Verify

```bash
./install.sh verify
SANDBOX_SMOKE_TEST=true HARAKIRI_TEMPLATE=open-agents-dev ./install.sh verify
oc get pods,routes -n "$NAMESPACE"
helm list -n "$NAMESPACE"
```

Checks cover API health, public web bootstrap origins and the exact OIDC issuer.
Localhost redirects fail. Optional runtime smoke creates, runs and terminates a
sandbox through public APIs. For CRC only set `INSTALL_INSECURE_TLS=true` before
prepare; the verifier prints the exception. Customers should trust the CA.
Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` globally.

Also test login/logout, invitations and BackgroundAgent's actual GitHub/agent
workflow. Running pods alone are insufficient. Phase 2B requires the separate
[persistent workspace tutorial](../../docs/persistent-workspaces.md).

## Upgrade and Uninstall

Back up database/storage and record digests. Helm rollback does not reverse DB
migrations. Never delete populated namespaces or shared CRDs during normal
upgrades. Uninstalling Harakiri does not prove runtime sandboxes/retained PVCs
were deleted. Obtain data-owner approval before physical reclaim or a clean
reinstall. Destructive cleanup is deliberately not automated.

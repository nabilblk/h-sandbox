# Harakiri on OpenShift - Legacy Elevated Lab Scripts

> These are environment-specific historical lab scripts, not the standalone OSS
> installation contract. They create/grant elevated SCCs and must not be used
> where the platform prohibits that. Start with the
> [standalone OpenShift prerequisites](../../docs/install-openshift.md).
> Customer composition has moved out; see the
> [separation notice](../../docs/customer-deployment-separation.md).

The behavior and commands below describe the existing elevated lab helper, not
a newly validated installation path. It is not a fallback for restricted-mode
failures. No lab script, default version or running environment was changed by
the customer-package extraction.

## Prerequisites

- `oc` logged in as **cluster-admin** (CRC: `oc login -u kubeadmin ...`)
- `helm` installed
- Images already in Harbor: the **release** workflow (api/web/chart) and the
  **mirror** workflow (`infra/mirror/images.txt`) have run; the `harakiri` project
  is public-read (or you've wired pull secrets)
- If Harbor uses a private CA, trust it cluster-wide (see the reference doc, Step 0)

## Install

```bash
export POSTGRES_PASSWORD='choose-one'
export KEYCLOAK_ADMIN_PASSWORD='choose-one'
./infra/openshift/install.sh
```

That's it. The apps domain is auto-detected (`apps-crc.testing` on CRC), and the
script is idempotent — re-run it any time.

## What it does

1. Creates the `harakiri`, `keycloak`, `opensandbox-system`, `opensandbox` projects
2. Applies the two SCCs (BuildKit builds; OpenSandbox egress `NET_ADMIN`) and grants them
3. Creates the API secret (+ optional Harbor template-push secret)
4. Deploys PostgreSQL (OpenShift-friendly image) and Keycloak (with realm import + Route)
5. Installs OpenSandbox (air-gap values) and the **Harakiri chart**, all pulling from Harbor
6. Creates Routes for web/api/keycloak and a `*.<apps>` sandbox wildcard

## Manual follow-ups (printed at the end too)

1. Create/verify a login user in the Keycloak `harakiri` realm, then sign in at the web Route.
2. `curl https://harakiri-api.<apps>/health`, then make an API key in the dashboard and try the CLI/SDK.
3. Confirm the two risky paths: `oc -n harakiri get jobs,pods` (a template build) and
   `oc -n opensandbox get pods` (a sandbox + its egress sidecar).

## Useful overrides (env vars)

| Var | Default | Use |
|-----|---------|-----|
| `APPS` | auto-detected | force the apps domain |
| `HARBOR` / `HARBOR_PROJECT` | `core.campus.clusterdiali.me` / `harakiri` | registry |
| `POSTGRES_IMAGE` | RH `rhel9/postgresql-16` | **air-gap:** mirror an OpenShift-friendly Postgres and set this (the `mirror/postgres` alpine image does **not** run under arbitrary UIDs) |
| `DEPLOY_POSTGRES=0` / `DEPLOY_KEYCLOAK=0` | on | use external Postgres/Keycloak (then set `DATABASE_URL`) |
| `HARBOR_TEMPLATE_ROBOT_USER` / `_PASSWORD` | — | enable Dockerfile template-build image push |
| `CHART_VERSION` | `0.1.0` | harakiri chart version |

## Uninstall

```bash
helm uninstall harakiri -n harakiri; helm uninstall opensandbox -n opensandbox-system
oc delete project harakiri keycloak opensandbox-system opensandbox
oc delete scc harakiri-buildkit opensandbox-dataplane
```

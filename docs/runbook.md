# Harakiri Sandbox Runbook

## Local Development

```bash
pnpm install
docker compose up -d postgres keycloak
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The seeded API key is:

```text
hk_live_demo_lyra_labs_0000000000000000000000000000000000
```

Useful local URLs:

- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18082`
- Keycloak: `http://127.0.0.1:18084`
- OpenSandbox proxy: `http://127.0.0.1:18083`

## k0s Bootstrap

This repository targets macOS hosts by creating a Linux VM with Lima and installing k0s inside it.

```bash
pnpm k0s:bootstrap
export KUBECONFIG="$PWD/infra/k0s/harakiri.kubeconfig"
pnpm k0s:verify
```

The bootstrap script:

- creates the `harakiri-k0s` Lima VM when missing
- installs k0s as a single-node controller with worker enabled
- writes `infra/k0s/harakiri.kubeconfig`
- installs Rancher local-path storage as the default storage class
- verifies the node is Ready

## Deploy

```bash
pnpm deploy:k0s
```

The deploy script:

- builds `harakiri-api:dev`
- builds `harakiri-web:dev`
- imports both images into the k0s containerd image store
- applies PostgreSQL, Keycloak, API, scheduler, and web manifests
- applies the Harakiri Keycloak login theme from the `keycloak-theme-harakiri` ConfigMap
- attempts to install the official OpenSandbox all-in-one Helm chart

If OpenSandbox cannot run in the local VM, the control-plane adapter remains usable with development fallback enabled. Disable fallback by setting `OPEN_SANDBOX_ALLOW_FALLBACK=0` in `infra/k8s/harakiri/harakiri.yaml`.

## Access

```bash
pnpm ports
```

This uses kubeconfig `infra/k0s/harakiri.kubeconfig`, opens all four forwards, and stores logs/PIDs under `/tmp/harakiri-portforwards`.
When `tmux` is available, the forwards run in a persistent `harakiri-port-forwards` tmux session.

```bash
pnpm ports:status
pnpm ports:stop
pnpm ports:restart
bash infra/scripts/port-forward.sh attach
```

## Smoke Test

```bash
pnpm smoke
pnpm smoke:ttl
pnpm smoke:route
pnpm e2e
pnpm screenshots
```

The smoke tests check API health, template listing, sandbox create/run/kill, TTL scheduler cleanup, and an exposed HTTP route through the OpenSandbox proxy. The Playwright E2E verifies Keycloak login, Keycloak JWT API auth, API key creation, sandbox create, terminal command execution, detail tabs, and browser kill. Screenshots are written to `docs/artifacts/`.

## CLI

```bash
pnpm --filter @harakiri/cli build
pnpm cli:pack
npm install -g ./dist-packages/harakiri-cli-0.1.0.tgz
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_demo_lyra_labs_0000000000000000000000000000000000
harakiri create --template python-3.12-data
harakiri run --stdin agent.py
harakiri list
```

## Teardown

```bash
infra/k0s/teardown.sh
```

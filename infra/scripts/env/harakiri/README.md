# Harakiri.io Environment Scripts

These scripts are intentionally environment-specific. They verify or manage the
current `harakiri.io` Cloudflare Tunnel and DNS setup, not the portable core
platform behavior.

Core route verification lives under `infra/scripts/`:

- `infra/scripts/route-smoke.sh` checks OpenSandbox gateway host routing through
  the local gateway forward.
- `infra/scripts/route-ingress-smoke.sh` checks k0s `ingress-nginx` and the
  OpenSandbox gateway through a local HTTPS port-forward.
- `infra/scripts/route-tls-dev-secret.sh` creates a local wildcard origin cert
  for k0s ingress testing.

Environment-specific checks here:

- `route-preflight.sh` checks public Cloudflare DNS/TLS for `*.harakiri.io`.
- `route-public-smoke.sh` creates a sandbox and fetches a real public HTTPS
  route through Cloudflare Tunnel.
- `cloudflare-sandbox-dns.sh` upserts the Cloudflare wildcard DNS record.
- `route-tls-letsencrypt-cloudflare.sh` requests a Let's Encrypt origin
  wildcard certificate with cert-manager and Cloudflare DNS-01.

## Public Developer Surface

### Supervised Local Origins

On the maintainer's macOS host, install user-login supervision with:

```bash
node infra/scripts/env/harakiri/local-services.mjs install --migrate-tmux
node infra/scripts/env/harakiri/local-services.mjs status
```

Separate `io.harakiri.lab.*` launch agents start the existing Lima VM, reconnect
the four public origin forwards after pod replacement, and run the existing
`harakiri-dev` named tunnel. The migration option stops only matching legacy
tmux windows; other forwards and unrelated launch agents remain unchanged.
Unknown port listeners cause installation to fail rather than being killed.
The existing `.cloudflared/config.yml` and its credential file are not changed.

Logs live in `~/Library/Logs/harakiri-lab/`. Hourly rotation truncates logs over
10 MiB in place; these are local diagnostics, not a durable audit log. The
cluster startup job exits successfully once Lima is running; that is normal.
Keep the repo and Node executable at their installed paths, or uninstall and
reinstall after moving them.

This is user-login supervision, not always-on hosting: it cannot serve while
the host is asleep, powered off, or waiting for the first user login. A public
production installation needs an always-on cluster and ingress/tunnel connector.

```bash
node infra/scripts/env/harakiri/local-services.mjs uninstall
```

Uninstall removes only these launch agents. It does not delete cluster data,
stop the VM, modify tunnel routes, or remove other applications' Cloudflare jobs.
The legacy `pnpm ports` helper leaves supervised origins alone.

The `harakiri-dev` Cloudflare Tunnel uses these hostnames:

- Web: `https://sb.harakiri.io` -> local k0s web forward `127.0.0.1:15173`
- Keycloak: `https://sb-auth.harakiri.io` -> local k0s Keycloak forward
  `127.0.0.1:18084`
- API: `https://sb-api.harakiri.io` -> local k0s API forward
  `127.0.0.1:18082`
- Sandbox routes: `https://<route-key>.harakiri.io` -> local k0s HTTPS ingress
  forward `127.0.0.1:18087`

Generated sandbox routes intentionally live one label below `harakiri.io` so
the existing `*.harakiri.io` edge certificate covers them. Exact tunnel host
rules for product services must stay above the wildcard sandbox rule.

Use the [versioned Helm installation and upgrade guide](../../../preview/README.md)
and the exact delivery receipt for this public lab. Preserve the current Secrets,
Helm values, public origins and SMTP configuration. `pnpm deploy:k0s` and the
legacy `env:harakiri:deploy-public` wrapper apply development fixtures and are
now intentionally rejected when an existing or requested origin is public.
Do not bypass `check-local-deploy.mjs` to redeploy the lab.

### Credentials and Identity Persistence

The September 9 launch rotation replaces the lab's human administrator,
Keycloak recovery, PostgreSQL, runtime connection and Vault wrapping credentials.
The owner-only handoff is under `~/.config/harakiri/private/`, outside Git and
the public docs. Do not publish it, put its values in shell history, or restore
old Helm values/Secrets independently of the matching database backup.

Keycloak's lab H2 database now uses `keycloak/keycloak-data` and a single
`Recreate` deployment. The previously ephemeral database was copied, recovered
in an isolated instance and checked for matching realms, users, roles, clients
and signing keys before cutover. This lab repair is not a production H2 or HA
recommendation. New shared installations should use the PostgreSQL-backed
Keycloak profile in the versioned install guide.

Never mount an empty volume over an existing H2 directory and assume the data
was migrated. Preserve and verify the original database first. The public lab's
import ConfigMap has no development users; the source development manifest still
has loopback-only fixtures. Do not apply that whole manifest to the public lab.
The live SMTP settings remain separate from password rotation.

## DNS And TLS

To request a Let's Encrypt wildcard origin certificate through Cloudflare
DNS-01:

```bash
export CLOUDFLARE_API_TOKEN=... # Zone:DNS:Edit and Zone:Zone:Read
export LETSENCRYPT_EMAIL=you@example.com
pnpm env:harakiri:route-tls-letsencrypt
kubectl -n opensandbox-system describe certificate harakiri-sandbox-wildcard-tls
```

To upsert the Cloudflare wildcard DNS record:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ZONE_ID=...
export HARAKIRI_SANDBOX_DNS_TARGET=<ingress-or-tunnel-hostname>
pnpm env:harakiri:cloudflare-dns
pnpm env:harakiri:route-preflight
```

The environment checks assume the maintainer Cloudflare Tunnel, DNS, and edge
TLS setup. They are not required for the generic core-platform smokes.

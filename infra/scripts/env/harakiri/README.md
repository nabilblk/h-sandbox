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

Deploy the generic k0s manifests with these environment overrides when this
maintainer environment should be active:

```bash
pnpm env:harakiri:deploy-public
```

The wrapper exports the environment below and calls `infra/scripts/deploy-k0s.sh`.
Use the explicit form when you need to override individual values:

```bash
export HARAKIRI_PUBLIC_API_URL=https://sb-api.harakiri.io
export HARAKIRI_PUBLIC_WEB_URL=https://sb.harakiri.io
export HARAKIRI_PUBLIC_KEYCLOAK_URL=https://sb-auth.harakiri.io
export HARAKIRI_SANDBOX_ROUTE_DOMAIN=harakiri.io
export HARAKIRI_SANDBOX_ROUTE_SCHEME=https
export HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST=http://keycloak.keycloak.svc.cluster.local:8080/realms/harakiri,http://127.0.0.1:18084/realms/harakiri,https://sb-auth.harakiri.io/realms/harakiri
export SENDGRID_API_KEY=...
pnpm deploy:k0s
```

When `SENDGRID_API_KEY` is present, `deploy-public.sh` configures Keycloak SMTP
with SendGrid, `no-reply@harakiri.io`, STARTTLS, and SMTP debug disabled. If the
variable is absent, the wrapper leaves SMTP untouched.

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

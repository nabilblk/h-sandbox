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

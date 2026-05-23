ALTER TABLE sandbox_routes
  ADD COLUMN IF NOT EXISTS route_key TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'opensandbox-server-proxy',
  ADD COLUMN IF NOT EXISTS provider_route_id TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE sandbox_routes
SET route_key = COALESCE(route_key, regexp_replace(host, '\..*$', '')),
    url = COALESCE(url, target_url),
    last_checked_at = COALESCE(last_checked_at, created_at),
    updated_at = now()
WHERE route_key IS NULL
   OR url IS NULL
   OR last_checked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_routes_host_unique_idx ON sandbox_routes(host);
CREATE INDEX IF NOT EXISTS sandbox_routes_state_idx ON sandbox_routes(state);

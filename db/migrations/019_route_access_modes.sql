ALTER TABLE sandbox_routes
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS access_token_hint TEXT,
  ADD COLUMN IF NOT EXISTS access_header_name TEXT;

UPDATE sandbox_routes
SET access_mode = COALESCE(access_mode, 'public')
WHERE access_mode IS NULL;

CREATE INDEX IF NOT EXISTS sandbox_routes_route_key_idx ON sandbox_routes(route_key);
CREATE INDEX IF NOT EXISTS sandbox_routes_access_mode_idx ON sandbox_routes(access_mode);

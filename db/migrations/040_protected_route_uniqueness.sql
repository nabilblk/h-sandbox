-- Protected routes share the API host and are addressed by their route key.
DROP INDEX IF EXISTS sandbox_routes_active_host_unique_idx;

CREATE UNIQUE INDEX sandbox_routes_active_host_unique_idx
  ON sandbox_routes(host)
  WHERE state <> 'terminated' AND access_mode = 'public';

CREATE UNIQUE INDEX sandbox_routes_active_key_unique_idx
  ON sandbox_routes(route_key)
  WHERE state <> 'terminated' AND route_key IS NOT NULL;

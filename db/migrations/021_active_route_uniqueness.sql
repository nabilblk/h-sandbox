ALTER TABLE sandbox_routes
  DROP CONSTRAINT IF EXISTS sandbox_routes_sandbox_id_port_key;

DROP INDEX IF EXISTS sandbox_routes_host_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_routes_active_port_unique_idx
  ON sandbox_routes(sandbox_id, port)
  WHERE state <> 'terminated';

CREATE UNIQUE INDEX IF NOT EXISTS sandbox_routes_active_host_unique_idx
  ON sandbox_routes(host)
  WHERE state <> 'terminated';

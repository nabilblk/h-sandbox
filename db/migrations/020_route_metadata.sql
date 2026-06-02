ALTER TABLE sandbox_routes
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_label TEXT,
  ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

UPDATE sandbox_routes
SET labels = COALESCE(labels, '{}')
WHERE labels IS NULL;

CREATE INDEX IF NOT EXISTS sandbox_routes_last_used_at_idx ON sandbox_routes(last_used_at DESC);
CREATE INDEX IF NOT EXISTS sandbox_routes_labels_gin_idx ON sandbox_routes USING GIN(labels);

ALTER TABLE sandboxes
  ADD COLUMN IF NOT EXISTS source_provenance JSONB;

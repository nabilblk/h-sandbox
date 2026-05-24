CREATE TABLE IF NOT EXISTS template_build_contexts (
  build_id TEXT PRIMARY KEY REFERENCES template_builds(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'tar+gzip',
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_count INTEGER,
  archive BYTEA NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_build_contexts_org_idx ON template_build_contexts(organization_id, updated_at DESC);

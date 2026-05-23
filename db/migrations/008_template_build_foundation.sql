ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cpu_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS memory_mb INTEGER NOT NULL DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS workdir TEXT NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS default_ports INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS runtime_family TEXT NOT NULL DEFAULT 'linux',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS image_digest TEXT,
  ADD COLUMN IF NOT EXISTS latest_version_id TEXT;

UPDATE templates
SET cpu_count = 2,
    memory_mb = 2048,
    runtime_family = 'python-data'
WHERE id = 'python-3.12-data';

UPDATE templates
SET cpu_count = 2,
    memory_mb = 2048,
    runtime_family = 'browser',
    default_ports = ARRAY[3000, 5173, 4321, 8000]
WHERE id = 'node-20-chromium';

UPDATE templates
SET cpu_count = 2,
    memory_mb = 2048,
    runtime_family = 'custom',
    default_ports = ARRAY[3000, 5173, 4321, 8000]
WHERE id = 'custom';

CREATE TABLE IF NOT EXISTS template_builds (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  source_type TEXT NOT NULL DEFAULT 'dockerfile',
  context_hash TEXT,
  dockerfile_path TEXT,
  build_args JSONB NOT NULL DEFAULT '{}',
  image_destination TEXT,
  image_digest TEXT,
  log_ref TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_builds_org_status_idx ON template_builds(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS template_builds_template_time_idx ON template_builds(template_id, created_at DESC);

CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  build_id TEXT REFERENCES template_builds(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  image_uri TEXT NOT NULL,
  image_digest TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  default_entrypoint TEXT[] NOT NULL DEFAULT ARRAY['sleep', '3600'],
  cpu_count INTEGER NOT NULL DEFAULT 1,
  memory_mb INTEGER NOT NULL DEFAULT 1024,
  workdir TEXT NOT NULL DEFAULT '/',
  default_ports INTEGER[] NOT NULL DEFAULT '{}',
  env_schema JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS template_versions_template_status_idx ON template_versions(template_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS template_versions_org_idx ON template_versions(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS template_build_logs (
  id BIGSERIAL PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES template_builds(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  stream TEXT NOT NULL DEFAULT 'stdout',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, line_no)
);

CREATE INDEX IF NOT EXISTS template_build_logs_build_idx ON template_build_logs(build_id, line_no);

CREATE TABLE IF NOT EXISTS template_registry_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  registry_host TEXT NOT NULL,
  username TEXT,
  secret_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE sandboxes
  ADD COLUMN IF NOT EXISTS template_version_id TEXT REFERENCES template_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_image_digest TEXT;

INSERT INTO template_versions (
  id,
  template_id,
  organization_id,
  version_number,
  aliases,
  image_uri,
  image_digest,
  status,
  default_entrypoint,
  cpu_count,
  memory_mb,
  workdir,
  default_ports,
  metadata,
  promoted_at
)
SELECT
  'tplv_' || regexp_replace(t.id, '[^a-zA-Z0-9]+', '_', 'g') || '_1',
  t.id,
  t.organization_id,
  1,
  ARRAY['latest', 'stable'],
  t.image,
  t.image_digest,
  'ready',
  t.default_entrypoint,
  t.cpu_count,
  t.memory_mb,
  t.workdir,
  t.default_ports,
  jsonb_build_object('source', 'seed'),
  now()
FROM templates t
ON CONFLICT (id) DO UPDATE
SET image_uri = EXCLUDED.image_uri,
    image_digest = EXCLUDED.image_digest,
    default_entrypoint = EXCLUDED.default_entrypoint,
    cpu_count = EXCLUDED.cpu_count,
    memory_mb = EXCLUDED.memory_mb,
    workdir = EXCLUDED.workdir,
    default_ports = EXCLUDED.default_ports;

UPDATE templates t
SET latest_version_id = v.id
FROM template_versions v
WHERE v.template_id = t.id
  AND v.version_number = 1
  AND t.latest_version_id IS NULL;

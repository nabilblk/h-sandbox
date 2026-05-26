ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS egress_allowed_presets TEXT[] NOT NULL DEFAULT ARRAY[
    'python-package-install',
    'node-package-install',
    'git-hosting',
    'llm-apis',
    'browser-basic'
  ]::text[],
  ADD COLUMN IF NOT EXISTS egress_custom_domains_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS egress_max_rules INTEGER NOT NULL DEFAULT 128,
  ADD COLUMN IF NOT EXISTS egress_redact_domains BOOLEAN NOT NULL DEFAULT false;


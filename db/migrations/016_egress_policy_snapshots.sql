ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_egress_policy JSONB NOT NULL DEFAULT '{"mode":"open","presets":[],"allow":[],"deny":[]}'::jsonb;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS egress_policy JSONB NOT NULL DEFAULT '{"mode":"open","presets":[],"allow":[],"deny":[]}'::jsonb;

ALTER TABLE template_versions
  ADD COLUMN IF NOT EXISTS egress_policy JSONB NOT NULL DEFAULT '{"mode":"open","presets":[],"allow":[],"deny":[]}'::jsonb;

ALTER TABLE sandboxes
  ADD COLUMN IF NOT EXISTS egress_policy JSONB NOT NULL DEFAULT '{"mode":"open","presets":[],"allow":[],"deny":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS egress_compiled_policy JSONB,
  ADD COLUMN IF NOT EXISTS egress_provider_status JSONB;

UPDATE template_versions v
SET egress_policy = t.egress_policy
FROM templates t
WHERE v.template_id = t.id
  AND v.egress_policy = '{"mode":"open","presets":[],"allow":[],"deny":[]}'::jsonb
  AND t.egress_policy <> v.egress_policy;

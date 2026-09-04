ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS credential_slots JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE template_versions
  ADD COLUMN IF NOT EXISTS credential_slots JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE template_versions v
SET credential_slots = COALESCE(t.credential_slots, '[]'::jsonb)
FROM templates t
WHERE t.id = v.template_id
  AND v.credential_slots = '[]'::jsonb;

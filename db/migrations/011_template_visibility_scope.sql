UPDATE templates
SET visibility = 'internal',
    updated_at = now()
WHERE organization_id IS NULL
  AND id = 'custom'
  AND visibility = 'private';

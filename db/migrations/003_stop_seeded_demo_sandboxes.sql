UPDATE sandboxes
SET status = 'terminated',
    cpu_pct = 0,
    memory_mb = 0,
    updated_at = now()
WHERE opensandbox_id IS NULL
  AND id IN ('sbx_jt29kf01x4', 'sbx_b8m4qa3eyl', 'sbx_98aa1cvz4t')
  AND status IN ('running', 'idle');

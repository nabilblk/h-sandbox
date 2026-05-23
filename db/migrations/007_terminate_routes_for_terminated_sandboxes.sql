UPDATE sandbox_routes sr
SET state = 'terminated',
    terminated_at = COALESCE(sr.terminated_at, now()),
    updated_at = now()
FROM sandboxes s
WHERE s.id = sr.sandbox_id
  AND s.status = 'terminated'
  AND sr.state <> 'terminated';

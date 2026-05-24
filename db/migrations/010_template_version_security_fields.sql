ALTER TABLE template_versions
  ADD COLUMN IF NOT EXISTS sbom_ref TEXT,
  ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS scan_summary JSONB NOT NULL DEFAULT '{}';

UPDATE template_versions
SET provenance = CASE
      WHEN provenance = '{}'::jsonb THEN jsonb_build_object(
        'source', COALESCE(metadata->>'source', 'unknown'),
        'imageUri', image_uri,
        'imageDigest', image_digest,
        'templateId', template_id,
        'buildId', build_id
      )
      ELSE provenance
    END,
    scan_status = COALESCE(NULLIF(scan_status, ''), 'not_scanned'),
    scan_summary = CASE
      WHEN scan_summary = '{}'::jsonb THEN jsonb_build_object('status', 'not_scanned', 'reason', 'scanner_not_configured')
      ELSE scan_summary
    END;

CREATE INDEX IF NOT EXISTS template_versions_scan_status_idx ON template_versions(scan_status, created_at DESC);

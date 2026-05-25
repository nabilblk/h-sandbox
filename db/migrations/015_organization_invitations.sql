CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  display_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  keycloak_user_id TEXT,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_status_check CHECK (status IN ('pending', 'sent', 'send_failed', 'accepted', 'canceled', 'expired')),
  CONSTRAINT organization_invitations_role_check CHECK (role IN ('admin', 'member'))
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_active_email_idx
  ON organization_invitations(organization_id, email_normalized)
  WHERE status IN ('pending', 'sent', 'send_failed');

CREATE INDEX IF NOT EXISTS organization_invitations_org_status_idx
  ON organization_invitations(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_invitations_email_idx
  ON organization_invitations(email_normalized)
  WHERE status IN ('pending', 'sent', 'send_failed');

INSERT INTO organization_invitations (
  organization_id,
  email_normalized,
  display_email,
  role,
  status,
  expires_at,
  created_at,
  updated_at
)
SELECT
  m.organization_id,
  lower(u.email),
  u.email,
  CASE WHEN m.role IN ('admin', 'member') THEN m.role ELSE 'member' END,
  'pending',
  m.created_at + interval '7 days',
  m.created_at,
  m.created_at
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE u.keycloak_subject IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM memberships m
USING users u
WHERE m.user_id = u.id
  AND u.keycloak_subject IS NULL;

DELETE FROM users u
WHERE u.keycloak_subject IS NULL
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
  AND EXISTS (
    SELECT 1
    FROM organization_invitations i
    WHERE i.email_normalized = lower(u.email)
  );

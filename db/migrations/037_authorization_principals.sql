ALTER TABLE api_keys
  ADD COLUMN created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN scopes TEXT[] NOT NULL DEFAULT ARRAY[
    'sandboxes:read', 'sandboxes:write', 'templates:read', 'templates:write',
    'workspaces:read', 'workspaces:write', 'credentials:use', 'org:read'
  ],
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN legacy BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE api_keys ADD CONSTRAINT api_keys_scopes_valid CHECK (
  cardinality(scopes) > 0 AND scopes <@ ARRAY[
    'sandboxes:read', 'sandboxes:write', 'templates:read', 'templates:write',
    'workspaces:read', 'workspaces:write', 'credentials:use', 'credentials:manage',
    'registry:manage', 'audit:read', 'org:read'
  ]::TEXT[] AND array_position(scopes, NULL) IS NULL
);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_new_key_expiry CHECK (legacy OR expires_at IS NOT NULL);
CREATE INDEX api_keys_creator_idx ON api_keys(organization_id, created_by_user_id);

ALTER TABLE terminal_attach_tickets
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  ADD COLUMN auth_expires_at TIMESTAMPTZ,
  ADD COLUMN subject TEXT;

COMMENT ON COLUMN api_keys.legacy IS 'Pre-037 keys retain runtime-only scopes, never inherited human administrator privileges.';
COMMENT ON COLUMN terminal_attach_tickets.auth_expires_at IS 'Original credential expiry, distinct from the short single-use ticket expiry.';

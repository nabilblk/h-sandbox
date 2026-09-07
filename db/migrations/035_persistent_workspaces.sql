CREATE TABLE persistent_workspaces (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  provider TEXT NOT NULL,
  provider_volume_name TEXT NOT NULL UNIQUE,
  storage_class TEXT,
  size_gib INTEGER NOT NULL CHECK (size_gib BETWEEN 1 AND 1024),
  quota_slot INTEGER NOT NULL CHECK (quota_slot BETWEEN 1 AND 1000),
  attached_sandbox_id TEXT UNIQUE REFERENCES sandboxes(id) DEFERRABLE INITIALLY DEFERRED,
  provision_attempted_at TIMESTAMPTZ,
  attachment_attempted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, quota_slot),
  UNIQUE (organization_id, name),
  CHECK (archived_at IS NULL OR attached_sandbox_id IS NULL)
);

ALTER TABLE sandboxes ADD COLUMN workspace_id TEXT;
ALTER TABLE sandboxes ADD CONSTRAINT sandbox_workspace_organization_fk
  FOREIGN KEY (organization_id, workspace_id) REFERENCES persistent_workspaces(organization_id, id);

-- Reserve in the sandbox INSERT statement so a failed INSERT cannot leak a mount.
CREATE FUNCTION reserve_sandbox_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    UPDATE persistent_workspaces SET attached_sandbox_id = NEW.id, attachment_attempted_at = NULL, updated_at = now()
      WHERE id = NEW.workspace_id AND organization_id = NEW.organization_id
        AND archived_at IS NULL AND attached_sandbox_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace_unavailable' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reserve_sandbox_workspace BEFORE INSERT ON sandboxes
  FOR EACH ROW EXECUTE FUNCTION reserve_sandbox_workspace();

CREATE FUNCTION immutable_sandbox_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'sandbox workspace cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_sandbox_workspace BEFORE UPDATE OF workspace_id ON sandboxes
  FOR EACH ROW EXECUTE FUNCTION immutable_sandbox_workspace();

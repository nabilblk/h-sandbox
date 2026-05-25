CREATE TABLE IF NOT EXISTS sandbox_operation_secrets (
  operation_id TEXT NOT NULL REFERENCES sandbox_operations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, name)
);

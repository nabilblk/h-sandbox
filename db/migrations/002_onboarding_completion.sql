ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE users
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE email = 'lyra@k.ai';

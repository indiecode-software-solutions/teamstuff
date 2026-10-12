-- ============================================================
-- Mail integration: BYO mailbox connections (Google OAuth +
-- Hostinger IMAP). All table access goes through Edge Functions
-- which verify the user's JWT; direct client access is revoked.
-- ============================================================

CREATE TABLE IF NOT EXISTS mail_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'hostinger')),
  email TEXT NOT NULL,
  -- AES-GCM encrypted credential (OAuth refresh token or IMAP app password).
  -- Encryption key lives only in Edge Function secrets, never in the DB.
  credential_enc TEXT NOT NULL,
  -- provider-specific metadata as JSON (e.g. google account sub, display name)
  meta JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disabled')),
  last_error TEXT,
  last_unread_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_mail_connections_user ON mail_connections(user_id);

ALTER TABLE mail_connections ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on purpose: the service role
-- (Edge Functions) bypasses RLS; clients must go through the API.
REVOKE ALL ON mail_connections FROM anon, authenticated;

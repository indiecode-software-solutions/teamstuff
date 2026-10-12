-- ============================================================
-- Company Chat Mode Schema: Anonymous vs Transparent Group Chat
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add chat_mode column to companies table (default: 'anonymous')
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS chat_mode text NOT NULL DEFAULT 'anonymous';

-- Ensure only valid modes are allowed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_chat_mode_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_chat_mode_check
      CHECK (chat_mode IN ('anonymous', 'transparent'));
  END IF;
END $$;

-- 2. Add is_anonymous column to company_discussions table (default: true)
-- This guarantees all existing messages remain permanently anonymous.
ALTER TABLE public.company_discussions
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

-- 3. Create index for efficient querying by company and anonymity
CREATE INDEX IF NOT EXISTS idx_company_discussions_is_anon
  ON public.company_discussions (company_id, is_anonymous);

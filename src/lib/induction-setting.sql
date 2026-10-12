-- ============================================================
-- Induction (first-login onboarding wizard) admin toggle
-- Run this once in the Supabase SQL editor.
-- ============================================================

alter table public.companies
  add column if not exists induction_enabled boolean not null default true;

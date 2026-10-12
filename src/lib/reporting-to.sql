-- ============================================================
-- Reporting Manager (reporting_to)
-- Run this in the Supabase SQL editor (project: corporate-intranet)
-- ============================================================

alter table public.profiles
  add column if not exists reporting_to uuid references public.profiles(id) on delete set null;

-- Index for faster lookups when building the hierarchy
create index if not exists profiles_reporting_to_idx on public.profiles (reporting_to);
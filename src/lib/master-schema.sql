-- ============================================================
-- Master Dashboard (SaaS owner console) schema
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- 1. SaaS management columns on the companies table
alter table public.companies
  add column if not exists plan text not null default 'Starter',
  add column if not exists seat_limit int not null default 50,
  add column if not exists storage_quota_gb int not null default 5,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now();

-- 2. Master admin identities (independent of employee auth)
create table if not exists public.master_admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  password_hash text not null, -- scrypt: <saltHex>:<hashHex> (see scripts/hash-password.mjs)
  auth_user_id uuid,           -- linked Supabase Auth user after first login
  created_at timestamptz not null default now()
);

-- 3. RLS: platform_owner can read/manage every company row
alter table public.companies enable row level security;

drop policy if exists "platform owner full access" on public.companies;
create policy "platform owner full access"
  on public.companies
  for all
  using (
    exists (
      select 1 from public.master_admins ma
      where ma.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.master_admins ma
      where ma.auth_user_id = auth.uid()
    )
  );

-- 4. Master admins can also read every profile (same company RLS otherwise blocks cross-tenant view)
drop policy if exists "platform owner read profiles" on public.profiles;
create policy "platform owner read profiles"
  on public.profiles
  for select
  using (
    exists (
      select 1 from public.master_admins ma
      where ma.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- First master admin (replace placeholders):
--   node scripts/hash-password.mjs "YourStr0ngPass!"  -> prints hash
--   insert into public.master_admins (email, name, password_hash)
--   values ('saas-owner@yoovaventures.com', 'SaaS Owner', '<hash>');
-- ============================================================
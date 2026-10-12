-- ============================================================
-- Fix RLS infinite recursion on public.profiles + lock down master_admins
-- Run once in the Supabase SQL editor.
-- ============================================================

-- 1. SECURITY DEFINER helper: checks admin role without re-entering RLS
create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 2. Rewrite the recursive admin policies to use the helper
drop policy if exists "Admins can delete employee profiles" on public.profiles;
create policy "Admins can delete employee profiles"
  on public.profiles for delete
  using (public.is_company_admin());

drop policy if exists "Admins can insert employee profiles" on public.profiles;
create policy "Admins can insert employee profiles"
  on public.profiles for insert
  with check (public.is_company_admin());

drop policy if exists "Admins can update employee profiles" on public.profiles;
create policy "Admins can update employee profiles"
  on public.profiles for update
  using (public.is_company_admin())
  with check (public.is_company_admin());

-- 3. Lock down master_admins (currently readable by anyone with the anon key:
--    emails + password hashes were exposed). Only the owner may see/manage their row.
alter table public.master_admins enable row level security;

drop policy if exists "master admin can access own record" on public.master_admins;
create policy "master admin can access own record"
  on public.master_admins
  for all
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

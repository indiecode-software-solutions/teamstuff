-- Leave management: per-company leave type quotas and holiday calendar.
-- Run this in the Supabase SQL editor.

create table if not exists public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  leave_type text not null,
  annual_quota numeric not null default 12,
  quota_period text not null default 'annual' check (quota_period in ('annual','monthly')),
  created_at timestamptz not null default now(),
  unique (company_id, leave_type)
);

-- Add quota_period to existing installs that predate monthly quotas.
-- Existing rows keep an annual period; HR can switch any type to monthly.
alter table public.leave_policies
  add column if not exists quota_period text not null default 'annual'
  check (quota_period in ('annual','monthly'));

create index if not exists leave_policies_company_idx on public.leave_policies(company_id);

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, date)
);

create index if not exists company_holidays_company_idx on public.company_holidays(company_id);

-- Company-wide weekly off-day configuration.
-- off_days holds day-of-week indices (0 = Sunday, 1 = Monday, ... 6 = Saturday).
-- A row is created only once a company customizes its default; otherwise the
-- app falls back to {0,6} (Saturday + Sunday).
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  off_days integer[] not null default '{0,6}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_settings_company_idx on public.company_settings(company_id);

-- Per-employee custom weekly off-day assignments (admin-set or from an approved
-- "Schedule" request). Merged with the company defaults when computing leave
-- day counts for that employee.
create table if not exists public.employee_off_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  off_days integer[] not null,
  set_by text not null default 'admin',  -- 'admin' | 'request'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id)
);

create index if not exists employee_off_days_company_idx on public.employee_off_days(company_id);
create index if not exists employee_off_days_employee_idx on public.employee_off_days(employee_id);

-- RLS: everyone in the company can read; writes restricted to admins.
alter table public.leave_policies enable row level security;
alter table public.company_holidays enable row level security;
alter table public.company_settings enable row level security;
alter table public.employee_off_days enable row level security;

drop policy if exists "leave_policies_read_company" on public.leave_policies;
create policy "leave_policies_read_company" on public.leave_policies
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "leave_policies_write_admin" on public.leave_policies;
create policy "leave_policies_write_admin" on public.leave_policies
  for all
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  );

drop policy if exists "company_holidays_read_company" on public.company_holidays;
create policy "company_holidays_read_company" on public.company_holidays
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "company_holidays_write_admin" on public.company_holidays;
create policy "company_holidays_write_admin" on public.company_holidays
  for all
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  );

drop policy if exists "company_settings_read_company" on public.company_settings;
create policy "company_settings_read_company" on public.company_settings
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "company_settings_write_admin" on public.company_settings;
create policy "company_settings_write_admin" on public.company_settings
  for all
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  );

drop policy if exists "employee_off_days_read_company" on public.employee_off_days;
create policy "employee_off_days_read_company" on public.employee_off_days
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "employee_off_days_write_admin" on public.employee_off_days;
create policy "employee_off_days_write_admin" on public.employee_off_days
  for all
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'hr')
  );

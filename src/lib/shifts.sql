-- Shifts feature: company-defined work shift templates.
-- Run this in the Supabase SQL editor.

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  start_time text not null,  -- "HH:MM" 24h
  end_time text not null,    -- "HH:MM" 24h
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shifts_company_idx on public.shifts(company_id);

-- Employee assignment (nullable: falls back to company default timing)
alter table public.profiles
  add column if not exists shift_id uuid references public.shifts(id) on delete set null;

-- RLS: employees can read their own company's shifts; writes are service-role only.
alter table public.shifts enable row level security;

drop policy if exists "shift_read_own_company" on public.shifts;
create policy "shift_read_own_company" on public.shifts
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );
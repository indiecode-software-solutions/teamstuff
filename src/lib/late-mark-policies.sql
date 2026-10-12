-- ============================================================
-- Late Mark Policies
-- Run this in the Supabase SQL editor (project: corporate-intranet)
-- ============================================================

-- 1. Late mark policy templates table
create table if not exists public.late_mark_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- 'half_day_after_marks' : after N late marks, subsequent late punches count as half days
  -- 'marks_to_half_day'    : every N late marks are counted as 1 half day
  penalty_type text not null check (penalty_type in ('half_day_after_marks', 'marks_to_half_day')),
  late_marks_count int not null check (late_marks_count >= 1),
  grace_minutes int not null default 10 check (grace_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure grace_minutes exists if table already created
alter table public.late_mark_policies
  add column if not exists grace_minutes int not null default 10;

create index if not exists late_mark_policies_company_idx
  on public.late_mark_policies (company_id);

-- RLS: authenticated users may read their own company's policies
alter table public.late_mark_policies enable row level security;

drop policy if exists "Company users can read their late mark policies" on public.late_mark_policies;
create policy "Company users can read their late mark policies"
  on public.late_mark_policies
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.company_id = late_mark_policies.company_id
    )
  );

-- 2. Shifts may reference a late mark policy
alter table public.shifts
  add column if not exists late_mark_policy_id uuid references public.late_mark_policies(id) on delete set null;

-- 3. Company default shift may reference a late mark policy and custom default grace minutes
alter table public.companies
  add column if not exists late_mark_policy_id uuid references public.late_mark_policies(id) on delete set null;

alter table public.companies
  add column if not exists late_grace_minutes int not null default 10;

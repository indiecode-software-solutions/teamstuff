-- Quick-chat "Discussions" for the dashboard card.
-- One-level thread model: parent_id = message being replied to.

create table if not exists public.company_discussions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  parent_id uuid references public.company_discussions(id) on delete cascade,
  mention_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_discussions_company_created_idx
  on public.company_discussions (company_id, created_at);

create index if not exists company_discussions_parent_idx
  on public.company_discussions (parent_id);

alter table public.company_discussions enable row level security;

drop policy if exists "company members can read discussions" on public.company_discussions;
create policy "company members can read discussions"
  on public.company_discussions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and company_id = company_discussions.company_id
    )
  );

drop policy if exists "company members can post discussions" on public.company_discussions;
create policy "company members can post discussions"
  on public.company_discussions for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and company_id = company_discussions.company_id
    )
  );

-- Only HR or Admin of the same company may delete messages
drop policy if exists "hr or admin can delete discussions" on public.company_discussions;
create policy "hr or admin can delete discussions"
  on public.company_discussions for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and company_id = company_discussions.company_id
        and role in ('hr', 'admin')
    )
  );

-- Live updates for the dashboard card
alter publication supabase_realtime add table public.company_discussions;
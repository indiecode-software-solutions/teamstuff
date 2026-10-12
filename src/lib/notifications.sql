-- In-app notifications for the intranet.
-- Run this once in the Supabase SQL editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  description text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where is_read = false;

alter table public.notifications enable row level security;

-- Users can only see their own notifications.
create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Users can create notifications for themselves or for any member of their
-- own company (so announcements and task assignments can be written directly).
create policy "Users can create notifications for same-company members"
  on public.notifications for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.profiles me, public.profiles target
      where me.id = auth.uid()
        and target.id = user_id
        and me.company_id = target.company_id
    )
  );

-- Users can mark their own notifications as read.
create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid());

-- Users can delete their own notifications.
create policy "Users can delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- Live badge updates across the app.
alter publication supabase_realtime add table public.notifications;
// ============================================================
// Team Activity: "What's everyone working on" daily status
// Run once in the Supabase SQL editor (or use scripts/migrate-team-activity.mjs)
// ============================================================

-- 1. Store the user's daily status on their profile row
alter table public.profiles
  add column if not exists manual_status text,
  add column if not exists manual_status_updated_at timestamptz;

-- 2. Guarantee the profile owner can update their own status row
--    (existing self-update policies already allow profile edits; this
--     explicitly covers the new manual_status columns)
drop policy if exists "Users can update own profile status" on public.profiles;
create policy "Users can update own profile status"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

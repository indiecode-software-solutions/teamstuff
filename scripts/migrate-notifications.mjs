// Creates the notifications table in Supabase.
// Usage: node scripts/migrate-notifications.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

if (!globalThis.WebSocket) {
  class MockWebSocket {
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  globalThis.WebSocket = MockWebSocket;
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Check if table already exists
const { error: probeError } = await admin.from("notifications").select("id").limit(1);
if (!probeError) {
  console.log("Already migrated — notifications table exists.");
  process.exit(0);
}

const sql = `
  create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    actor_id uuid references public.profiles(id) on delete set null,
    type text not null,
    title text not null,
    description text not null default '',
    link text,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
  );

  -- Index for fast user lookups
  create index if not exists notifications_user_id_idx on public.notifications(user_id);
  create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read);

  -- Enable RLS
  alter table public.notifications enable row level security;

  -- Users can only see their own notifications
  drop policy if exists "Users can view own notifications" on public.notifications;
  create policy "Users can view own notifications"
    on public.notifications for select
    using (auth.uid() = user_id);

  -- Users can mark their own notifications as read
  drop policy if exists "Users can update own notifications" on public.notifications;
  create policy "Users can update own notifications"
    on public.notifications for update
    using (auth.uid() = user_id);

  -- Service role / authenticated users can insert notifications
  drop policy if exists "Authenticated users can insert notifications" on public.notifications;
  create policy "Authenticated users can insert notifications"
    on public.notifications for insert
    with check (true);

  -- Enable realtime
  alter publication supabase_realtime add table public.notifications;
`;

const { error: rpcError } = await admin.rpc("exec_sql", { query: sql });
if (!rpcError) {
  console.log("Migration applied: notifications table created.");
  process.exit(0);
}

console.error(
  "Could not auto-apply migration (need exec_sql RPC). Run this in the Supabase SQL editor:\n",
);
console.error(sql);
process.exit(1);

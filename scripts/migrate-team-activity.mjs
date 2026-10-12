// Applies the team-activity schema migration (manual_status columns on profiles).
// Usage: node scripts/migrate-team-activity.mjs
// Uses SUPABASE_SERVICE_ROLE_KEY from .env
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

// Polyfill WebSocket for Node < 22 (only REST calls are used here)
if (!globalThis.WebSocket) {
  class MockWebSocket {
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  globalThis.WebSocket = MockWebSocket;
}

const sql = `
  alter table public.profiles
    add column if not exists manual_status text,
    add column if not exists manual_status_updated_at timestamptz;

  drop policy if exists "Users can update own profile status" on public.profiles;
  create policy "Users can update own profile status"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);
`;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1. Already migrated? (column present)
const { error: probeError } = await admin.from("profiles").select("manual_status").limit(1);

if (!probeError) {
  console.log("Already migrated — manual_status columns exist on profiles.");
  process.exit(0);
}

// 2. Try the exec_sql RPC wrapper if the project has one
const { error: rpcError } = await admin.rpc("exec_sql", { query: sql });
if (!rpcError) {
  console.log("Migration applied: manual_status + manual_status_updated_at added to profiles.");
  process.exit(0);
}

// 3. Otherwise instruct manual run
console.error(
  "Could not auto-apply migration (need exec_sql RPC). Run this in the Supabase SQL editor:\n",
);
console.error(sql);
process.exit(1);

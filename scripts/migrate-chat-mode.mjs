// Migration script to add chat_mode to companies and is_anonymous to company_discussions.
// Usage: node scripts/migrate-chat-mode.mjs
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

// Polyfill WebSocket for Node < 22
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

async function checkColumns() {
  const { error: compErr } = await admin.from("companies").select("chat_mode").limit(1);
  const { error: discErr } = await admin.from("company_discussions").select("is_anonymous").limit(1);

  if (!compErr && !discErr) {
    console.log("✅ Database already has chat_mode on companies and is_anonymous on company_discussions.");
    return true;
  }
  return false;
}

const alreadyMigrated = await checkColumns();
if (alreadyMigrated) {
  process.exit(0);
}

const sql = `
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS chat_mode text NOT NULL DEFAULT 'anonymous';

ALTER TABLE public.company_discussions
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_company_discussions_is_anon
  ON public.company_discussions (company_id, is_anonymous);
`;

const { error: rpcError } = await admin.rpc("exec_sql", { query: sql });
if (!rpcError) {
  console.log("✅ Successfully applied chat_mode and is_anonymous migration via exec_sql.");
  process.exit(0);
}

console.log("ℹ️ Auto-migration via exec_sql not available. Please run src/lib/chat-mode-schema.sql in Supabase SQL editor:");
console.log(sql);

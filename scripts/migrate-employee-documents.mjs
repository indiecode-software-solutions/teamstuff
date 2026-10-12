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

const sqlPath = resolve(process.cwd(), "supabase/migrations/employee_documents_schema.sql");
const sql = readFileSync(sqlPath, "utf8");

try {
  const { error: rpcError } = await admin.rpc("exec_sql", { query: sql });
  if (rpcError) {
    console.error("exec_sql error:", rpcError);
    // Try probing if tables exist
    const { error: probeError1 } = await admin.from("company_document_requirements").select("id").limit(1);
    const { error: probeError2 } = await admin.from("employee_documents").select("id").limit(1);
    if (!probeError1 && !probeError2) {
      console.log("Tables already exist!");
      process.exit(0);
    }
    console.log("Please run migration in Supabase SQL editor:\n", sql);
  } else {
    console.log("✅ Successfully applied employee documents migration!");
  }
} catch (e) {
  console.error("Error executing migration:", e);
}

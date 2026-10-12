import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.['VITE_SUPABASE_URL']) ||
  (typeof process !== "undefined" && (process.env?.['VITE_SUPABASE_URL'] || process.env?.['SUPABASE_URL'])) ||
  "";
const supabaseAnonKey =
  (typeof import.meta !== "undefined" && ((import.meta as any).env?.['VITE_SUPABASE_ANON_KEY'] || (import.meta as any).env?.['VITE_SUPABASE_PUBLISHABLE_KEY'])) ||
  (typeof process !== "undefined" && (process.env?.['VITE_SUPABASE_ANON_KEY'] || process.env?.['VITE_SUPABASE_PUBLISHABLE_KEY'] || process.env?.['SUPABASE_ANON_KEY'])) ||
  "";

// Polyfill global WebSocket for Node SSR environments running Node < 22
if (typeof window === "undefined" && !globalThis.WebSocket) {
  class MockWebSocket {
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as any).WebSocket = MockWebSocket;
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing in env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

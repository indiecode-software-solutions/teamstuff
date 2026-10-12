import fs from "fs";
import { createClient } from "@supabase/supabase-js";

async function main() {
  try {
    const env = fs.readFileSync(".env", "utf8");
    const url = env.match(/VITE_SUPABASE_URL=["\x27]?([^"\x27\r\n]+)/)?.[1];
    const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=["\x27]?([^"\x27\r\n]+)/)?.[1] ||
                env.match(/VITE_SUPABASE_ANON_KEY=["\x27]?([^"\x27\r\n]+)/)?.[1];

    if (!url || !key) {
      console.log("Missing Supabase credentials in .env");
      return;
    }

    const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { createWebSocket: null } });

    // Test if forum_polls exists
    const { error: pollError } = await sb.from("forum_polls").select("id").limit(1);
    if (pollError) {
      console.log("ℹ️ forum_polls table pending migration:", pollError.message);
    } else {
      console.log("✅ forum_polls table is active!");
    }

    const { error: voteError } = await sb.from("forum_poll_votes").select("id").limit(1);
    if (voteError) {
      console.log("ℹ️ forum_poll_votes table pending migration:", voteError.message);
    } else {
      console.log("✅ forum_poll_votes table is active!");
    }
  } catch (err) {
    console.error("Migration runner error:", err.message);
  }
}

main();

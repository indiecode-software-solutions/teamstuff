// @ts-nocheck
// To-Do item reminder dispatcher.
//
// Invoked every minute by pg_cron (see src/lib/lists-reminders.sql).
// Finds due, not-yet-sent reminders on todo_list_items and delivers them
// as FCM device push notifications to the assignee's registered mobile
// devices. Works regardless of where the reminder was created from
// (mobile app or desktop browser), since delivery is fully server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64url helper
function b64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Generates Google OAuth2 Access Token using Service Account credentials
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const { private_key: privateKey, client_email: clientEmail } = serviceAccount;

  // 1. Import PKCS#8 private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDer.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  // 2. Prepare JWT Claims
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const encodedHeader = b64url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = b64url(encoder.encode(JSON.stringify(payload)));
  const message = encoder.encode(`${encodedHeader}.${encodedPayload}`);

  // 3. Sign JWT
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, message);
  const encodedSignature = b64url(new Uint8Array(signature));
  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  // 4. Request Google Access Token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Only the cron job (holding the service role key) may trigger this.
    // Trimmed comparison guards against stray whitespace in the Vault copy.
    const authHeader = req.headers.get("Authorization") || "";
    const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!supabaseServiceRole || providedKey !== supabaseServiceRole.trim()) {
      console.warn(
        `todo-reminders: unauthorized call. headerLen=${authHeader.length} keyLen=${providedKey.length} envLen=${supabaseServiceRole.length}`,
      );
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("todo-reminders: tick");

    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // Fetch due reminders (minute-level precision; cron runs every minute)
    const { data: dueItems, error: dueError } = await supabase
      .from("todo_list_items")
      .select(
        `id, text, remind_at, assignee_id,
         list:todo_lists ( name )`,
      )
      .eq("reminder_sent", false)
      .eq("completed", false)
      .not("remind_at", "is", null)
      .not("assignee_id", "is", null)
      .lte("remind_at", new Date().toISOString());

    if (dueError) throw dueError;
    if (!dueItems || dueItems.length === 0) {
      console.log("todo-reminders: no due reminders");
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Firebase credentials for FCM HTTP v1
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not configured.");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;
    const accessToken = await getGoogleAccessToken(serviceAccount);

    console.log(`todo-reminders: processing ${dueItems.length} due reminder(s)`);

    let sentCount = 0;
    for (const item of dueItems) {
      let itemSent = 0;
      try {
        // All devices this user has the mobile app installed on
        const { data: pushTokens } = await supabase
          .from("push_tokens")
          .select("token")
          .eq("user_id", item.assignee_id);

        if (pushTokens && pushTokens.length > 0) {
          const listName = item.list?.name || "your to-do list";
          const sendPromises = pushTokens.map(async (entry: any) => {
            const fcmPayload = {
              message: {
                token: entry.token,
                notification: {
                  title: "To-Do Reminder",
                  body: `${item.text} — from "${listName}"`,
                },
                data: {
                  link: "/lists",
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                },
                android: {
                  notification: {
                    click_action: "OPEN_APP",
                    channel_id: "reminders",
                  },
                },
                apns: {
                  payload: {
                    aps: {
                      category: "OPEN_APP",
                    },
                  },
                },
              },
            };

            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(fcmPayload),
              },
            );

            if (!res.ok) {
              const errText = await res.text();
              console.error(`FCM send failed for token ${entry.token}:`, errText);
              // Clean up dead tokens so they don't fail forever
              if (res.status === 404 || errText.includes("UNREGISTERED") || errText.includes("NotRegistered")) {
                await supabase.from("push_tokens").delete().eq("token", entry.token);
                console.log(`Removed unregistered token ${entry.id}`);
              }
              return false;
            }
            return true;
          });

          const results = await Promise.all(sendPromises);
          itemSent = results.filter(Boolean).length;
          sentCount += itemSent;
        }
      } catch (itemErr) {
        console.error(`Failed processing reminder for item ${item.id}:`, itemErr);
      } finally {
        // Mark as handled so we never retry forever. If at least one device
        // got the push, also clear remind_at so the UI chip disappears.
        const update: Record<string, unknown> = { reminder_sent: true };
        if (itemSent > 0) update.remind_at = null;
        await supabase.from("todo_list_items").update(update).eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ success: true, due: dueItems.length, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in todo-reminders edge function:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

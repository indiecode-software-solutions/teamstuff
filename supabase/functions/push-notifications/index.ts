// @ts-nocheck
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
  for (let i = 0; i < binaryDerString.length; i++) {
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
    ["sign"]
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
    // Read request body
    const { targetUserId, title, body, link } = await req.json();

    if (!targetUserId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: targetUserId, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // Fetch assignee's active push tokens
    const { data: pushTokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", targetUserId);

    if (tokenError) {
      throw tokenError;
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log(`No registered push tokens found for user: ${targetUserId}`);
      return new Response(
        JSON.stringify({ success: true, message: "No registered push tokens for user." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Firebase Credentials
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not configured.");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    // Get Google OAuth access token
    const accessToken = await getGoogleAccessToken(serviceAccount);

    // Send push notification to all user tokens
    const sendPromises = pushTokens.map(async (item: any) => {
      const fcmPayload = {
        message: {
          token: item.token,
          notification: {
            title: title,
            body: body,
          },
          data: {
            link: link || "",
            click_action: "FLUTTER_NOTIFICATION_CLICK", // for cross-compatibility
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
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fcmPayload),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`FCM send failed for token ${item.token}:`, errText);
      } else {
        console.log(`FCM push sent successfully to token: ${item.token}`);
      }
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in push edge function:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

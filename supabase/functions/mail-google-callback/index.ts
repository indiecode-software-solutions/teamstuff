// Google OAuth2 callback — Supabase Edge Function
//
// Flow:
//   1. User clicks "Continue with Google" → frontend asks `mail` function
//      for a signed consent URL (state = HMAC{uid, exp}).
//   2. Google redirects here with ?code&state.
//   3. We verify the state signature, exchange the code for tokens,
//      encrypt and store the refresh token, then redirect the user's
//      browser back to the app.

import { verifyOAuthState } from "../_shared/crypto.ts";
import { getSupabaseAdmin, corsHeaders } from "../_shared/mail-core.ts";
import {
  exchangeGoogleCode,
  getGoogleRedirectUri,
} from "../_shared/gmail.ts";
import { encryptCredential } from "../_shared/crypto.ts";

function getAppUrl(): string {
  const explicit = Deno.env.get("SITE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  return "http://localhost:8080";
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${getAppUrl()}${path}` },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("Google OAuth error:", error, url.searchParams.get("error_description"));
    return redirectTo(`/mail?google=denied`);
  }
  if (!code || !state) {
    return redirectTo(`/mail?google=invalid`);
  }

  const verified = await verifyOAuthState(state);
  if (!verified) {
    return redirectTo(`/mail?google=state_mismatch`);
  }

  try {
    const { refreshToken, email, name, picture } = await exchangeGoogleCode(code);
    void getGoogleRedirectUri; // referenced for env validation on cold start

    const encrypted = await encryptCredential(refreshToken);
    const supabase = getSupabaseAdmin();

    const accountEmail = email ?? `google-${verified.uid}`;
    await supabase.from("mail_connections").upsert(
      {
        user_id: verified.uid,
        provider: "google",
        email: accountEmail,
        credential_enc: encrypted,
        status: "active",
        last_error: null,
        meta: {
          name: name ?? "",
          picture: picture ?? "",
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" },
    );

    return redirectTo(`/mail?connected=${encodeURIComponent(accountEmail)}`);
  } catch (err) {
    console.error("Google callback failed:", err);
    return redirectTo(`/mail?google=exchange_failed`);
  }
});

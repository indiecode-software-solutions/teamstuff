// Shared types + auth/db helpers for the mail Edge Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredential } from "./crypto.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export interface MailConnectionRow {
  id: string;
  user_id: string;
  provider: "google" | "hostinger";
  email: string;
  credential_enc: string;
  meta: Record<string, unknown>;
  status: string;
  last_error: string | null;
  last_unread_count: number;
}

export interface DecryptedConnection {
  id: string;
  userId: string;
  provider: "google" | "hostinger";
  email: string;
  credential: string; // google: refresh token; hostinger: app password
  meta: Record<string, unknown>;
}

export function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Validates the caller's JWT and returns the user id. */
export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new HttpError(401, "Missing authorization token");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Invalid or expired token");
  return data.user.id;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ status: "error", message: err.message }, err.status);
  }
  console.error("Unhandled mail error:", err);
  const message = err instanceof Error ? err.message : "Internal error";
  return json({ status: "error", message }, 500);
}

/** Fetch a connection by id and verify it belongs to the caller. */
export async function getOwnedConnection(
  connectionId: string,
  userId: string,
): Promise<DecryptedConnection> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mail_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !data) throw new HttpError(404, "Mail connection not found");
  const row = data as MailConnectionRow;
  if (row.user_id !== userId) throw new HttpError(403, "Not your connection");
  if (row.status === "disabled") throw new HttpError(403, "Connection is disabled");

  let credential: string;
  try {
    credential = await decryptCredential(row.credential_enc);
  } catch {
    throw new HttpError(500, "Failed to decrypt stored credential");
  }
  if (!credential) throw new HttpError(401, "Stored credential is invalid — reconnect the account");

  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    email: row.email,
    credential,
    meta: row.meta ?? {},
  };
}

export async function markConnectionError(connectionId: string, message: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("mail_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

export async function updateUnreadCount(connectionId: string, count: number) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("mail_connections")
    .update({ last_unread_count: count, last_checked_at: new Date().toISOString() })
    .eq("id", connectionId);
}

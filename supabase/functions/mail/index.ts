// @ts-nocheck
// Mail API — Supabase Edge Function
// Single entrypoint for all mail operations. The caller's Supabase JWT
// identifies the user; every connection access is ownership-checked.
//
// Actions (POST JSON unless noted):
//   connections            → list user's connections (no secrets)
//   connect-hostinger      {email, password}          → verify + store
//   disconnect             {connectionId}             → remove
//   google-auth-url        → { url } consent redirect URL
//   list                   {connectionId, folder, page, perPage}
//   message                {connectionId, id, folder}
//   send                   multipart/form-data (to, subject, body, attachments[])
//                          or JSON {connectionId, to, subject, body}
//   delete                 {connectionId, id, folder}
//   unread                 {connectionId}

import { json, errorResponse, HttpError } from "../_shared/mail-core.ts";
import {
  requireUserId,
  getOwnedConnection,
  getSupabaseAdmin,
  corsHeaders,
  markConnectionError,
  updateUnreadCount,
  DecryptedConnection,
} from "../_shared/mail-core.ts";
import { encryptCredential, signOAuthState } from "../_shared/crypto.ts";
import {
  buildGoogleAuthUrl,
  getAccessToken,
  listGmailMessages,
  getGmailMessage,
  getGmailAttachment,
  sendGmailMessage,
  deleteGmailMessage,
  getGmailUnreadCount,
  markGmailAsRead,
  SendAttachment,
} from "../_shared/gmail.ts";
import {
  verifyHostingerLogin,
  listHostingerMessages,
  getHostingerMessage,
  deleteHostingerMessage,
  getHostingerUnreadCount,
  getHostingerAttachment,
  sendViaHostingerSmtp,
  markHostingerAsRead,
} from "../_shared/imap.ts";
import { sanitizeEmailHtml } from "../_shared/mail-utils.ts";

const DEFAULT_PER_PAGE = 25;

function perPage(raw: unknown): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : DEFAULT_PER_PAGE;
}

async function withProvider<T>(
  conn: DecryptedConnection,
  fn: (credential: string) => Promise<T>,
): Promise<T> {
  try {
    return await fn(conn.credential);
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      await markConnectionError(conn.id, err.message);
    }
    throw err;
  }
}

async function refreshAndSaveUnreadCount(conn: DecryptedConnection): Promise<void> {
  let count = 0;
  if (conn.provider === "google") {
    const token = await getAccessToken(conn.credential);
    count = await getGmailUnreadCount(token);
  } else {
    count = await getHostingerUnreadCount(conn.email, conn.credential);
  }
  await updateUnreadCount(conn.id, count);
}

async function handleList(userId: string, body: Record<string, unknown>) {
  const conn = await getOwnedConnection(String(body.connectionId), userId);
  const folder = String(body.folder ?? "inbox");
  const page = Math.max(1, parseInt(String(body.page ?? "1"), 10) || 1);
  const size = perPage(body.perPage);

  if (conn.provider === "google") {
    return withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      return listGmailMessages(token, folder, page, size);
    });
  }
  return listHostingerMessages(conn.email, conn.credential, folder, page, size);
}

async function handleMessage(userId: string, body: Record<string, unknown>) {
  const conn = await getOwnedConnection(String(body.connectionId), userId);
  const id = String(body.id ?? "");
  const folder = String(body.folder ?? "inbox");
  if (!id) throw new HttpError(400, "Missing message id");

  if (conn.provider === "google") {
    const msg = await withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      // Retrieve message
      const m = await getGmailMessage(token, id);
      // Mark as read in Gmail (ignore failure)
      try {
        await markGmailAsRead(token, id);
      } catch { /* ignore */ }
      return m;
    });
    msg.bodyHtml = msg.bodyHtml ? sanitizeEmailHtml(msg.bodyHtml) : null;
    // Trigger lazy unread count update in database cache
    void refreshAndSaveUnreadCount(conn).catch(() => {});
    return msg;
  }
  const msg = await getHostingerMessage(conn.email, conn.credential, id, folder);
  msg.bodyHtml = msg.bodyHtml ? sanitizeEmailHtml(msg.bodyHtml) : null;
  // Mark as read in IMAP (ignore failure)
  try {
    await markHostingerAsRead(conn.email, conn.credential, id, folder);
  } catch { /* ignore */ }
  // Trigger lazy unread count update in database cache
  void refreshAndSaveUnreadCount(conn).catch(() => {});
  return msg;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function handleAttachment(userId: string, body: Record<string, unknown>) {
  const conn = await getOwnedConnection(String(body.connectionId), userId);
  const id = String(body.id ?? "");
  const folder = String(body.folder ?? "inbox");
  const filename = String(body.filename ?? "");
  if (!id || !filename) throw new HttpError(400, "Missing message id or filename");

  if (conn.provider === "google") {
    return withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      const full = await getGmailMessage(token, id);
      const att = full.attachments.find((a) => a.filename === filename);
      if (!att?.attachmentId) throw new HttpError(404, "Attachment not found");
      const { bytes } = await getGmailAttachment(token, id, att.attachmentId);
      return { status: "success", data: bytesToBase64(bytes), contentType: att.contentType };
    });
  }

  const result = await getHostingerAttachment(conn.email, conn.credential, id, filename, folder);
  if (!result) throw new HttpError(404, "Attachment not found");
  return { status: "success", data: bytesToBase64(result.bytes), contentType: result.contentType };
}

interface ParsedSend {
  connectionId: string;
  to: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references?: string;
  files: { filename: string; content: Uint8Array; contentType: string }[];
}

function parseSendFields(fields: Record<string, unknown>, files: ParsedSend["files"]): ParsedSend {
  return {
    connectionId: String(fields.connectionId ?? ""),
    to: String(fields.to ?? ""),
    subject: String(fields.subject ?? ""),
    bodyHtml: String(fields.body ?? ""),
    inReplyTo: typeof fields.inReplyTo === "string" ? fields.inReplyTo : undefined,
    references: typeof fields.references === "string" ? fields.references : undefined,
    files,
  };
}

async function handleSend(userId: string, send: ParsedSend) {
  const { connectionId, to, subject, bodyHtml, inReplyTo, references, files } = send;

  if (!to) throw new HttpError(400, "Missing recipient");
  if (!bodyHtml.trim() && files.length === 0) {
    throw new HttpError(400, "Message cannot be empty");
  }

  const conn = await getOwnedConnection(connectionId, userId);

  if (conn.provider === "google") {
    await withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      await sendGmailMessage(
        token,
        conn.email,
        to,
        subject,
        bodyHtml,
        files as SendAttachment[],
        inReplyTo,
        references,
      );
    });
  } else {
    await sendViaHostingerSmtp(
      conn.email,
      conn.credential,
      to,
      subject,
      bodyHtml,
      files,
      inReplyTo,
      references,
    );
  }
  return { status: "success" };
}

async function handleDelete(userId: string, body: Record<string, unknown>) {
  const conn = await getOwnedConnection(String(body.connectionId), userId);
  const id = String(body.id ?? "");
  const folder = String(body.folder ?? "inbox");
  if (!id) throw new HttpError(400, "Missing message id");

  if (conn.provider === "google") {
    await withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      await deleteGmailMessage(token, id, folder);
    });
  } else {
    await deleteHostingerMessage(conn.email, conn.credential, id, folder);
  }
  return { status: "success" };
}

async function handleUnread(userId: string, body: Record<string, unknown>) {
  const conn = await getOwnedConnection(String(body.connectionId), userId);
  let count = 0;
  if (conn.provider === "google") {
    count = await withProvider(conn, async (cred) => {
      const token = await getAccessToken(cred);
      return getGmailUnreadCount(token);
    });
  } else {
    count = await getHostingerUnreadCount(conn.email, conn.credential);
  }
  await updateUnreadCount(conn.id, count);
  return { status: "success", count };
}

async function handleConnections(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mail_connections")
    .select("id, provider, email, status, last_error, last_unread_count, last_checked_at, created_at, meta")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const connections = (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    email: row.email,
    status: row.status,
    last_error: row.last_error,
    last_unread_count: row.last_unread_count,
    last_checked_at: row.last_checked_at,
    created_at: row.created_at,
    photo: (row.meta as { picture?: string } | null)?.picture ?? null,
  }));
  return { status: "success", connections };
}

async function handleConnectHostinger(userId: string, body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email || !password) throw new HttpError(400, "Email and password required");

  const check = await verifyHostingerLogin(email, password);
  if (!check.ok) throw new HttpError(401, check.message);

  const encrypted = await encryptCredential(password);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mail_connections")
    .upsert(
      {
        user_id: userId,
        provider: "hostinger",
        email,
        credential_enc: encrypted,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" },
    )
    .select("id, provider, email, status")
    .single();

  if (error) throw new Error(error.message);
  return { status: "success", connection: data };
}

async function handleDisconnect(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("mail_connections")
    .delete()
    .eq("id", String(body.connectionId))
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return { status: "success" };
}

async function handleGoogleAuthUrl(userId: string) {
  const state = await signOAuthState(userId);
  return { status: "success", url: buildGoogleAuthUrl(state) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await requireUserId(req);

    // GET convenience: /mail?action=list&connectionId=...&folder=...
    if (req.method === "GET") {
      const url = new URL(req.url);
      const params = Object.fromEntries(url.searchParams.entries());
      switch (url.searchParams.get("action")) {
        case "connections":
          return json(await handleConnections(userId));
        case "list":
          return json(await handleList(userId, params));
        case "message":
          return json({ status: "success", message: await handleMessage(userId, params) });
        case "unread":
          return json(await handleUnread(userId, params));
        default:
          throw new HttpError(400, "Unknown action");
      }
    }

    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, unknown> = {};
    let send: ParsedSend | null = null;

    if (contentType.includes("application/json")) {
      body = ((await req.json()) as Record<string, unknown>);
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files: ParsedSend["files"] = [];
      for (const entry of form.getAll("attachments")) {
        if (entry instanceof File) {
          files.push({
            filename: entry.name,
            content: new Uint8Array(await entry.arrayBuffer()),
            contentType: entry.type || "application/octet-stream",
          });
        }
      }
      const fields: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
      }
      body = fields;
      send = parseSendFields(fields, files);
    }

    const action = String(body.action ?? "");

    switch (action) {
      case "connections":
        return json(await handleConnections(userId));
      case "connect-hostinger":
        return json(await handleConnectHostinger(userId, body));
      case "disconnect":
        return json(await handleDisconnect(userId, body));
      case "google-auth-url":
        return json(await handleGoogleAuthUrl(userId));
      case "list":
        return json(await handleList(userId, body));
      case "message":
        return json({ status: "success", message: await handleMessage(userId, body) });
      case "attachment":
        return json(await handleAttachment(userId, body));
      case "send":
        if (!send) send = parseSendFields(body, []);
        return json(await handleSend(userId, send));
      case "delete":
        return json(await handleDelete(userId, body));
      case "unread":
        return json(await handleUnread(userId, body));
      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    return errorResponse(err);
  }
});

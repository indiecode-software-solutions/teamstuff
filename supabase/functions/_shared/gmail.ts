// Gmail API provider — OAuth2 (granular scopes) + REST calls.
// Access tokens are refreshed server-side from the stored refresh token
// and never exposed to the client.

import { HttpError } from "./mail-core.ts";
import {
  MailAttachmentMeta,
  MailFullMessage,
  FolderListResult,
  MailSummary,
  decodeMimeWords,
  parseAddress,
  toIsoDate,
} from "./mail-utils.ts";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

// ── OAuth ────────────────────────────────────────────────────

export function getGoogleClientId(): string {
  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!id) throw new Error("GOOGLE_CLIENT_ID secret is not set");
  return id;
}

export function getGoogleClientSecret(): string {
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET secret is not set");
  return secret;
}

export function getGoogleRedirectUri(): string {
  const explicit = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (explicit) return explicit;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL missing");
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mail-google-callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // need refresh token
    prompt: "consent", // force refresh token even on re-consent
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleCode(
  code: string,
): Promise<{ refreshToken: string; email: string | null; name: string | null; picture: string | null }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      data.error_description ?? data.error ?? "Google token exchange failed",
    );
  }
  // Identify the account via userinfo (email + profile)
  let email: string | null = null;
  let name: string | null = null;
  let picture: string | null = null;
  try {
    const info = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    if (info.ok) {
      const profile = (await info.json()) as {
        email?: string;
        name?: string;
        picture?: string;
      };
      email = profile.email ?? null;
      name = profile.name ?? null;
      picture = profile.picture ?? null;
    }
  } catch {
    // non-fatal
  }
  return { refreshToken: data.refresh_token, email, name, picture };
}

// ── Access tokens (refreshed + cached per isolate) ───────────

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.exp > Date.now() / 1000 + 60) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const reason = data.error_description ?? data.error ?? "token refresh failed";
    if (reason.includes("revoked") || reason.includes("expired")) {
      throw new HttpError(401, "Google access revoked — reconnect the account");
    }
    throw new Error(`Gmail token refresh failed: ${reason}`);
  }
  const exp = Date.now() / 1000 + (data.expires_in ?? 3600);
  tokenCache.set(refreshToken, { token: data.access_token, exp });
  return data.access_token;
}

async function gmailFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new HttpError(401, "Gmail session expired — reconnect the account");
  }
  return res;
}

// ── Folders ──────────────────────────────────────────────────

function folderToQuery(folder: string): { labelIds?: string[]; q?: string } {
  switch (folder.toLowerCase()) {
    case "inbox":
      return { labelIds: ["INBOX"] };
    case "sent":
      return { labelIds: ["SENT"] };
    case "trash":
      return { labelIds: ["TRASH"] };
    case "drafts":
      return { labelIds: ["DRAFTS"] };
    case "archive":
      return {
        q: "in:anywhere -in:inbox -in:sent -in:trash -in:drafts -is:chat",
      };
    default:
      return { labelIds: ["INBOX"] };
  }
}

// ── List ─────────────────────────────────────────────────────

interface GmailListResponse {
  messages?: { id: string; threadId: string; snippet?: string }[];
  resultSizeEstimate?: number;
}

interface GmailMessageMeta {
  id: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: { name: string; value: string }[];
  };
}

function headerValue(msg: GmailMessageMeta, name: string): string {
  const h = msg.payload?.headers?.find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? "";
}

export async function listGmailMessages(
  accessToken: string,
  folder: string,
  page: number,
  perPage: number,
): Promise<FolderListResult> {
  const query = folderToQuery(folder);
  let nextPageToken: string | undefined = undefined;
  let messages: { id: string; threadId: string }[] = [];
  let estimateTotal = 0;

  // Gmail API requires step-by-step token navigation to reach target offset page
  for (let p = 1; p <= page; p++) {
    const params = new URLSearchParams({
      maxResults: String(perPage),
    });
    if (query.labelIds) params.set("labelIds", query.labelIds[0]);
    if (query.q) params.set("q", query.q);
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const listRes = await gmailFetch(
      accessToken,
      `/messages?${params.toString()}`,
    );
    if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status})`);
    const listData = (await listRes.json()) as GmailListResponse & { nextPageToken?: string };
    
    if (p === page) {
      messages = listData.messages ?? [];
      estimateTotal = listData.resultSizeEstimate ?? messages.length;
    }
    nextPageToken = listData.nextPageToken;
    if (!nextPageToken) break; // End of list reached early
  }

  const ids = messages.map((m) => m.id);
  const total = nextPageToken ? estimateTotal + perPage : estimateTotal;

  // Fetch metadata for each id in parallel
  const metas = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await gmailFetch(
          accessToken,
          `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        );
        if (!r.ok) return null;
        return (await r.json()) as GmailMessageMeta;
      } catch {
        return null;
      }
    }),
  );

  const emails: MailSummary[] = [];
  for (let i = 0; i < ids.length; i++) {
    const meta = metas[i];
    if (!meta) continue;
    const fromRaw = headerValue(meta, "From");
    const parsed = parseAddress(fromRaw);
    emails.push({
      id: meta.id,
      subject: decodeMimeWords(headerValue(meta, "Subject")) || "(No Subject)",
      from: decodeMimeWords(fromRaw),
      fromName: parsed.name,
      fromEmail: parsed.email,
      date: toIsoDate(headerValue(meta, "Date")),
      snippet: meta.snippet ?? "",
      unread: (meta.labelIds ?? []).includes("UNREAD"),
      hasAttachments: false, // refined on open; keeps list fast
    });
  }

  return { emails, total, page, perPage };
}

// ── Read ─────────────────────────────────────────────────────

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: {
    size?: number;
    data?: string; // base64url
    attachmentId?: string;
  };
  parts?: GmailPart[];
}

interface GmailFullMessage {
  id: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
  internalDate?: string;
}

function base64UrlDecode(data: string): Uint8Array {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function findBodyParts(parts: GmailPart[]): {
  html: string | null;
  text: string | null;
} {
  let html: string | null = null;
  let text: string | null = null;
  for (const part of parts) {
    const type = part.mimeType ?? "";
    if (type === "text/html" && !html && part.body?.data) {
      html = new TextDecoder().decode(base64UrlDecode(part.body.data));
    } else if (type === "text/plain" && !text && part.body?.data) {
      text = new TextDecoder().decode(base64UrlDecode(part.body.data));
    } else if (part.parts) {
      const nested = findBodyParts(part.parts);
      html = html ?? nested.html;
      text = text ?? nested.text;
    }
  }
  return { html, text };
}

function collectAttachments(parts: GmailPart[]): MailAttachmentMeta[] {
  const out: MailAttachmentMeta[] = [];
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      out.push({
        filename: decodeMimeWords(part.filename),
        contentType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) out.push(...collectAttachments(part.parts));
  }
  return out;
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<MailFullMessage> {
  const res = await gmailFetch(accessToken, `/messages/${messageId}?format=full`);
  if (!res.ok) throw new Error(`Gmail message fetch failed (${res.status})`);
  const msg = (await res.json()) as GmailFullMessage;

  const payload = msg.payload ?? {};
  const headers = payload.headers ?? [];
  const getHeader = (name: string) =>
    decodeMimeWords(headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "");

  let html: string | null = null;
  let text: string | null = null;
  let attachments: MailAttachmentMeta[] = [];

  if (payload.parts) {
    const bodies = findBodyParts(payload.parts);
    html = bodies.html;
    text = bodies.text;
    attachments = collectAttachments(payload.parts);
  } else if (payload.body?.data) {
    const decoded = new TextDecoder().decode(base64UrlDecode(payload.body.data));
    if (payload.mimeType === "text/html") html = decoded;
    else text = decoded;
  }

  const fromRaw = getHeader("From");
  const parsed = parseAddress(fromRaw);

  return {
    id: msg.id,
    subject: getHeader("Subject") || "(No Subject)",
    from: fromRaw,
    fromName: parsed.name,
    fromEmail: parsed.email,
    to: getHeader("To"),
    date: msg.internalDate
      ? new Date(parseInt(msg.internalDate, 10)).toISOString()
      : toIsoDate(getHeader("Date")),
    bodyHtml: html,
    bodyText: text,
    attachments,
    messageIdHeader: getHeader("Message-ID"),
    references: getHeader("References"),
  };
}

// ── Attachments ──────────────────────────────────────────────

export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await gmailFetch(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
  if (!res.ok) throw new Error(`Attachment fetch failed (${res.status})`);
  const data = (await res.json()) as { data?: string };
  if (!data.data) throw new Error("Empty attachment");
  return { bytes: base64UrlDecode(data.data), contentType: "application/octet-stream" };
}

// ── Send ─────────────────────────────────────────────────────

export interface SendAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailMessage(
  accessToken: string,
  fromEmail: string,
  to: string,
  subject: string,
  bodyHtml: string,
  attachments: SendAttachment[],
  inReplyTo?: string,
  references?: string,
): Promise<void> {
  const boundary = `teamstuff_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();

  let mime =
    `From: ${fromEmail}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n`;
  if (inReplyTo) mime += `In-Reply-To: ${inReplyTo}\r\n`;
  if (references) mime += `References: ${references}\r\n`;
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  mime +=
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 8bit\r\n\r\n` +
    `${bodyHtml}\r\n`;

  for (const att of attachments) {
    mime +=
      `--${boundary}\r\n` +
      `Content-Type: ${att.contentType}; name="${att.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
      `${b64urlEncodeBytes(att.content)}\r\n`;
  }
  mime += `--${boundary}--\r\n`;

  const raw = b64urlEncodeBytes(encoder.encode(mime));
  const res = await gmailFetch(accessToken, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errText.slice(0, 200)}`);
  }
}

// ── Delete / trash ───────────────────────────────────────────

export async function deleteGmailMessage(
  accessToken: string,
  messageId: string,
  folder: string,
): Promise<void> {
  if (folder.toLowerCase() === "trash") {
    const res = await gmailFetch(accessToken, `/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Permanent delete failed (${res.status})`);
    return;
  }
  const res = await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    }),
  });
  if (!res.ok) throw new Error(`Move to trash failed (${res.status})`);
}

export async function markGmailAsRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const res = await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      removeLabelIds: ["UNREAD"],
    }),
  });
  if (!res.ok) throw new Error(`Mark as read failed (${res.status})`);
}

// ── Unread count ─────────────────────────────────────────────

export async function getGmailUnreadCount(accessToken: string): Promise<number> {
  const res = await gmailFetch(accessToken, "/labels/INBOX");
  if (!res.ok) throw new Error(`Gmail labels failed (${res.status})`);
  const label = (await res.json()) as { messagesUnread?: number };
  return label.messagesUnread ?? 0;
}

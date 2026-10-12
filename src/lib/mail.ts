// Client for the `mail` Supabase Edge Function.
// All secrets stay server-side; the browser only ever sees message data.

import { supabase } from "./supabase";

export interface MailConnection {
  id: string;
  provider: "google" | "hostinger";
  email: string;
  status: string;
  last_error: string | null;
  last_unread_count: number;
  last_checked_at: string | null;
  created_at: string;
  photo?: string | null;
}

export interface MailSummary {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  fromEmail: string;
  date: string;
  snippet: string;
  unread: boolean;
  hasAttachments: boolean;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  size: number;
  attachmentId?: string;
}

export interface MailMessage extends MailSummary {
  to: string;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: MailAttachment[];
  messageIdHeader: string;
  references: string;
}

export interface FolderListResult {
  emails: MailSummary[];
  total: number;
  page: number;
  perPage: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mail", { body });
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Connections ──────────────────────────────────────────────

export async function fetchConnections(): Promise<MailConnection[]> {
  const res = await invoke<{ status: string; connections: MailConnection[] }>({
    action: "connections",
  });
  return res.connections ?? [];
}

export async function getGoogleAuthUrl(): Promise<string> {
  const res = await invoke<{ status: string; url: string }>({
    action: "google-auth-url",
  });
  return res.url;
}

export async function connectHostinger(
  email: string,
  password: string,
): Promise<MailConnection> {
  const res = await invoke<{ status: string; connection: MailConnection }>({
    action: "connect-hostinger",
    email,
    password,
  });
  return res.connection;
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  await invoke({ action: "disconnect", connectionId });
}

// ── Messages ─────────────────────────────────────────────────

export async function listMessages(
  connectionId: string,
  folder: string,
  page = 1,
  perPage = 25,
): Promise<FolderListResult> {
  return invoke<FolderListResult>({
    action: "list",
    connectionId,
    folder,
    page,
    perPage,
  });
}

export async function getMessage(
  connectionId: string,
  id: string,
  folder: string,
): Promise<MailMessage> {
  const res = await invoke<{ status: string; message: MailMessage }>({
    action: "message",
    connectionId,
    id,
    folder,
  });
  return res.message;
}

export async function sendMessage(input: {
  connectionId: string;
  to: string;
  subject: string;
  body: string;
  attachments?: File[];
  inReplyTo?: string;
  references?: string;
}): Promise<void> {
  const { attachments, ...rest } = input;

  if (attachments && attachments.length > 0) {
    const form = new FormData();
    form.append("action", "send");
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) form.append(key, String(value));
    }
    for (const file of attachments) {
      form.append("attachments", file);
    }
    const { error } = await supabase.functions.invoke("mail", { body: form });
    if (error) throw new Error(error.message);
    return;
  }

  await invoke({ action: "send", ...rest });
}

export async function deleteMessage(
  connectionId: string,
  id: string,
  folder: string,
): Promise<void> {
  await invoke({ action: "delete", connectionId, id, folder });
}

export async function fetchUnreadCount(connectionId: string): Promise<number> {
  const res = await invoke<{ status: string; count: number }>({
    action: "unread",
    connectionId,
  });
  return res.count;
}

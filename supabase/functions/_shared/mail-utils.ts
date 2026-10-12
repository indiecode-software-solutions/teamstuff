// Shared formatting/parsing helpers used by both mail providers.

export interface ParsedAddress {
  name: string;
  email: string;
}

/** Decodes RFC 2047 encoded words: =?charset?B/Q?text?= */
export function decodeMimeWords(input: string): string {
  if (!input) return "";
  return input.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, charset: string, enc: string, text: string) => {
      try {
        let bytes: Uint8Array;
        if (enc.toLowerCase() === "b") {
          const bin = atob(text);
          bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        } else {
          // Q-encoding: underscores are spaces, =XX hex escapes
          const q = text.replace(/_/g, " ").replace(
            /=([0-9A-Fa-f]{2})/g,
            (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)),
          );
          bytes = Uint8Array.from(q, (c) => c.charCodeAt(0));
        }
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return text;
      }
    },
  );
}

/** Parses 'John Doe <john@x.com>' (or bare address) into parts. */
export function parseAddress(raw: string): ParsedAddress {
  const decoded = decodeMimeWords(raw ?? "").trim();
  const match = decoded.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || match[2].trim(), email: match[2].trim() };
  }
  return { name: decoded, email: decoded };
}

export function toIsoDate(raw: string | undefined | null): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export interface MailSummary {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  fromEmail: string;
  date: string; // ISO
  snippet: string;
  unread: boolean;
  hasAttachments: boolean;
}

export interface MailAttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  attachmentId?: string; // gmail only
}

export interface MailFullMessage {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: MailAttachmentMeta[];
  messageIdHeader: string;
  references: string;
}

export interface FolderListResult {
  emails: MailSummary[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Defense-in-depth HTML sanitization for email bodies.
 * The frontend additionally renders bodies in a fully sandboxed iframe
 * (no scripts, no same-origin), so this is a second layer, not the only one.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<object[\s\S]*?<\/object\s*>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}

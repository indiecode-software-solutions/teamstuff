// Minimal IMAP4revl client + SMTP-over-TLS sender for Hostinger-style
// mailboxes. Runs inside Supabase Edge Functions over Deno.connectTls.
//
// Implements exactly what the mail UI needs (mirrors the legacy Python
// implementation): login verify, folder select, search, header/body fetch,
// move-to-trash delete, append-to-Sent, unread counts.

import {
  MailAttachmentMeta,
  MailFullMessage,
  FolderListResult,
  MailSummary,
  decodeMimeWords,
  parseAddress,
  toIsoDate,
} from "./mail-utils.ts";

export const HOSTINGER_CONFIG = {
  imapServer: "imap.hostinger.com",
  imapPort: 993,
  smtpServer: "smtp.hostinger.com",
  smtpPort: 465,
};

const FOLDER_MAP: Record<string, string> = {
  inbox: "INBOX",
  sent: "INBOX.Sent",
  trash: "INBOX.Trash",
};

function resolveFolder(folder: string): string {
  return FOLDER_MAP[folder.toLowerCase()] ?? "INBOX";
}

function imapQuote(value: string): string {
  if (/[^\x20-\x7e]/.test(value)) {
    throw new Error("Credentials contain unsupported characters");
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ── Low-level client ─────────────────────────────────────────

interface FetchResult {
  sequence: number;
  flags: string[];
  bodyLiteral: string | null;
}

class ImapClient {
  private conn!: Deno.TlsConn;
  private buf = new Uint8Array(0);
  private tagCounter = 0;

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({
      hostname: HOSTINGER_CONFIG.imapServer,
      port: HOSTINGER_CONFIG.imapPort,
    });
    // Server greeting
    const greeting = await this.readLine();
    if (!greeting.includes("OK")) {
      throw new Error(`IMAP greeting failed: ${greeting}`);
    }
  }

  async close(): Promise<void> {
    try {
      await this.sendRaw(`a${++this.tagCounter} LOGOUT\r\n`);
    } catch { /* ignore */ }
    try {
      this.conn.close();
    } catch { /* ignore */ }
  }

  private async fill(): Promise<boolean> {
    const chunk = new Uint8Array(8192);
    const n = await this.conn.read(chunk);
    if (n === null) return false;
    const merged = new Uint8Array(this.buf.length + n);
    merged.set(this.buf);
    merged.set(chunk.slice(0, n), this.buf.length);
    this.buf = merged;
    return true;
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const idx = this.buf.indexOf(13); // \r
      if (idx !== -1 && this.buf[idx + 1] === 10) {
        const line = new TextDecoder().decode(this.buf.slice(0, idx));
        this.buf = this.buf.slice(idx + 2);
        return line;
      }
      if (!(await this.fill())) throw new Error("IMAP connection closed");
    }
  }

  /** Reads a line; if it ends with {N}, also consumes N literal bytes. */
  private async readLineWithLiterals(): Promise<{
    text: string;
    literal: Uint8Array | null;
  }> {
    let line = await this.readLine();
    let literal: Uint8Array | null = null;
    // Handle chained literals on one line (rare) — take the last one
    const match = line.match(/\{(\d+)\}$/);
    if (match) {
      const size = parseInt(match[1], 10);
      while (this.buf.length < size) {
        if (!(await this.fill())) throw new Error("IMAP connection closed mid-literal");
      }
      literal = this.buf.slice(0, size);
      this.buf = this.buf.slice(size);
      line = await this.readLine(); // remainder after literal
    }
    return { text: line, literal };
  }

  private async sendRaw(data: string): Promise<void> {
    await this.conn.write(new TextEncoder().encode(data));
  }

  /**
   * Sends a tagged command and collects untagged responses until the
   * tagged completion line. Returns { status, lines }.
   */
  async command(body: string): Promise<{ status: string; lines: string[] }> {
    const tag = `a${++this.tagCounter}`;
    await this.sendRaw(`${tag} ${body}\r\n`);
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(tag + " ")) {
        const status = line.slice(tag.length + 1).split(" ")[0];
        return { status, lines };
      }
      lines.push(line);
    }
  }

  /** APPEND with a literal payload (used to save copies to Sent). */
  async append(
    mailbox: string,
    flags: string,
    content: Uint8Array,
  ): Promise<boolean> {
    const tag = `a${++this.tagCounter}`;
    await this.sendRaw(
      `${tag} APPEND ${imapQuote(mailbox)} (${flags}) {${content.length}}\r\n`,
    );
    const cont = await this.readLine();
    if (!cont.startsWith("+")) return false;
    await this.conn.write(content);
    await this.sendRaw("\r\n");
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(tag + " ")) {
        return line.split(" ")[1] === "OK";
      }
    }
  }
}

// ── FETCH parsing ────────────────────────────────────────────

interface FetchResult {
  sequence: number;
  flags: string[];
  bodyLiteral: string | null;
}

// The current folder must be selected before fetching; keep it explicit.
let currentFolder: string | null = null;
function resolveFolderCurrent(): string {
  if (!currentFolder) throw new Error("No IMAP folder selected");
  return currentFolder;
}

async function selectFolder(client: ImapClient, folder: string): Promise<number> {
  const target = resolveFolder(folder);
  currentFolder = target;
  const res = await client.command(`SELECT ${imapQuote(target)}`);
  if (res.status !== "OK") throw new Error(`Cannot open folder ${target}`);
  let exists = 0;
  for (const line of res.lines) {
    const m = line.match(/^\*\s+(\d+)\s+EXISTS/i);
    if (m) exists = parseInt(m[1], 10);
  }
  return exists;
}

async function searchIds(
  client: ImapClient,
  criteria: string,
): Promise<number[]> {
  const res = await client.command(`SEARCH ${criteria}`);
  for (const line of res.lines) {
    const m = line.match(/^\*\s+SEARCH\s*(.*)$/i);
    if (m) {
      return m[1].trim().split(/\s+/).filter(Boolean).map(Number);
    }
  }
  return [];
}

/** Fetches one message's headers + flags. */
async function fetchHeader(
  client: ImapClient,
  seq: number,
): Promise<FetchResult | null> {
  // Low-level exchange because the response contains a literal.
  const cmdTag = `f${Math.floor(Math.random() * 1e9)}`;
  await client["sendRaw"](
    `${cmdTag} FETCH ${seq} (BODY.PEEK[HEADER] FLAGS)\r\n`,
  );

  let flags: string[] = [];
  let bodyLiteral: string | null = null;
  let sequence = seq;

  for (;;) {
    const { text, literal } = await client["readLineWithLiterals"]();
    if (text.startsWith(cmdTag + " ")) {
      if (!text.includes("OK")) return null;
      break;
    }
    const m = text.match(/^\*\s+(\d+)\s+FETCH\s+\((.*)\)\s*$/is);
    if (m) {
      sequence = parseInt(m[1], 10);
      const rest = m[2];
      const flagMatch = rest.match(/FLAGS\s+\(([^)]*)\)/i);
      if (flagMatch) flags = flagMatch[1].trim().split(/\s+/).filter(Boolean);
      if (literal && /BODY\[HEADER\]/i.test(rest)) {
        bodyLiteral = new TextDecoder().decode(literal);
      }
    }
  }
  return { sequence, flags, bodyLiteral };
}

/** Fetches the full RFC822 body of one message. */
async function fetchFullMessage(
  client: ImapClient,
  seq: number,
): Promise<string | null> {
  const cmdTag = `g${Math.floor(Math.random() * 1e9)}`;
  await client["sendRaw"](`${cmdTag} FETCH ${seq} (BODY.PEEK[])\r\n`);
  for (;;) {
    const { text, literal } = await client["readLineWithLiterals"]();
    if (text.startsWith(cmdTag + " ")) {
      return literal ? new TextDecoder().decode(literal) : null;
    }
    if (literal && /^\*\s+\d+\s+FETCH/i.test(text)) {
      // The literal is the message; the closing ")" arrives on the next line.
      const msg = new TextDecoder().decode(literal);
      await client["readLine"](); // consume trailing ")"
      // Wait for tagged completion
      for (;;) {
        const done = await client["readLine"]();
        if (done.startsWith(cmdTag + " ")) break;
      }
      return msg;
    }
  }
}

// ── MIME parsing (multipart) ─────────────────────────────────

interface MimePartNode {
  headers: Map<string, string>;
  body: string;
  contentType: string;
  children: MimePartNode[];
}

function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }
  }
  return headers;
}

function parseMime(raw: string): MimePartNode {
  const sepIndex = raw.indexOf("\r\n\r\n");
  const fallbackIdx = raw.indexOf("\n\n");
  const splitAt = sepIndex !== -1 ? sepIndex : fallbackIdx;
  const headerBlock = splitAt !== -1 ? raw.slice(0, splitAt) : "";
  const body = splitAt !== -1 ? raw.slice(splitAt + (raw[splitAt + 1] === "\n" ? 2 : 4)) : raw;
  const headers = parseHeaders(headerBlock);
  const contentType = headers.get("content-type") ?? "text/plain";

  const node: MimePartNode = { headers, body, contentType, children: [] };

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch && /^multipart\//i.test(contentType)) {
    const boundary = `--${boundaryMatch[1]}`;
    const sections = body.split(boundary).slice(1, -1); // drop preamble/epilogue
    for (const section of sections) {
      const trimmed = section.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      if (trimmed === "--") continue;
      node.children.push(parseMime(trimmed));
    }
  }
  return node;
}

function collectParts(node: MimePartNode): MimePartNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectParts);
}

function decodeTransferEncoding(part: MimePartNode): string {
  const encoding = (part.headers.get("content-transfer-encoding") ?? "").toLowerCase();
  if (encoding === "base64") {
    try {
      const bin = atob(part.body.replace(/\s+/g, ""));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const charset = (part.headers.get("content-type").match(/charset="?([^";]+)"?/i)?.[1] ?? "utf-8");
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return part.body;
    }
  }
  if (encoding === "quoted-printable") {
    return part.body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)));
  }
  return part.body;
}

function extractDispositionFilename(part: MimePartNode): string | null {
  const disposition = part.headers.get("content-disposition") ?? "";
  if (!/attachment/i.test(disposition)) return null;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? decodeMimeWords(match[1]) : null;
}

// ── Public API ───────────────────────────────────────────────

export async function verifyHostingerLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  const client = new ImapClient();
  try {
    await client.connect();
    const res = await client.command(
      `LOGIN ${imapQuote(email)} ${imapQuote(password)}`,
    );
    return { ok: res.status === "OK", message: res.status === "OK" ? "Login successful" : "Invalid credentials" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection error" };
  } finally {
    await client.close();
  }
}

export async function listHostingerMessages(
  email: string,
  password: string,
  folder: string,
  page: number,
  perPage: number,
): Promise<FolderListResult> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") throw new Error("Invalid mail credentials");

    await selectFolder(client, folder);

    const allIds = await searchIds(client, "ALL");
    allIds.reverse(); // newest first
    const total = allIds.length;

    const start = (page - 1) * perPage;
    const pageIds = allIds.slice(start, start + perPage);

    const emails: MailSummary[] = [];
    for (const seq of pageIds) {
      const header = await fetchHeader(client, seq);
      if (!header?.bodyLiteral) continue;
      const headers = parseHeaders(header.bodyLiteral);
      const fromRaw = decodeMimeWords(headers.get("from") ?? "");
      const parsed = parseAddress(fromRaw);
      emails.push({
        id: String(seq),
        subject: decodeMimeWords(headers.get("subject") ?? "") || "(No Subject)",
        from: fromRaw,
        fromName: parsed.name,
        fromEmail: parsed.email,
        date: toIsoDate(headers.get("date")),
        snippet: "",
        unread: !header.flags.some((f) => f.toLowerCase() === "\\seen"),
        hasAttachments: false,
      });
    }
    return { emails, total, page, perPage };
  } finally {
    await client.close();
    currentFolder = null;
  }
}

export async function getHostingerMessage(
  email: string,
  password: string,
  messageId: string,
  folder: string,
): Promise<MailFullMessage> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") throw new Error("Invalid mail credentials");

    await selectFolder(client, folder);
    const raw = await fetchFullMessage(client, parseInt(messageId, 10));
    if (!raw) throw new Error("Could not fetch message");

    const tree = parseMime(raw);
    const headers = tree.headers;
    const parts = collectParts(tree);

    let html: string | null = null;
    let text: string | null = null;
    const attachments: MailAttachmentMeta[] = [];

    for (const part of parts) {
      const filename = extractDispositionFilename(part);
      if (filename) {
        attachments.push({
          filename,
          contentType: part.contentType.split(";")[0].trim(),
          size: part.body.length,
        });
        continue;
      }
      const type = part.contentType.split(";")[0].trim().toLowerCase();
      const decoded = decodeTransferEncoding(part);
      if (type === "text/html" && !html) html = decoded;
      else if (type === "text/plain" && !text) text = decoded;
    }

    const fromRaw = decodeMimeWords(headers.get("from") ?? "");
    const parsed = parseAddress(fromRaw);

    return {
      id: messageId,
      subject: decodeMimeWords(headers.get("subject") ?? "") || "(No Subject)",
      from: fromRaw,
      fromName: parsed.name,
      fromEmail: parsed.email,
      to: decodeMimeWords(headers.get("to") ?? ""),
      date: toIsoDate(headers.get("date")),
      bodyHtml: html,
      bodyText: text,
      attachments,
      messageIdHeader: headers.get("message-id") ?? "",
      references: headers.get("references") ?? "",
    };
  } finally {
    await client.close();
    currentFolder = null;
  }
}

export async function getHostingerAttachment(
  email: string,
  password: string,
  messageId: string,
  filename: string,
  folder: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") throw new Error("Invalid mail credentials");

    await selectFolder(client, folder);
    const raw = await fetchFullMessage(client, parseInt(messageId, 10));
    if (!raw) return null;

    const parts = collectParts(parseMime(raw));
    for (const part of parts) {
      const name = extractDispositionFilename(part);
      if (name === filename) {
        const encoding = (part.headers.get("content-transfer-encoding") ?? "").toLowerCase();
        if (encoding === "base64") {
          const bin = atob(part.body.replace(/\s+/g, ""));
          return {
            bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)),
            contentType: part.contentType.split(";")[0].trim(),
          };
        }
        return {
          bytes: new TextEncoder().encode(part.body),
          contentType: part.contentType.split(";")[0].trim(),
        };
      }
    }
    return null;
  } finally {
    await client.close();
    currentFolder = null;
  }
}

export async function deleteHostingerMessage(
  email: string,
  password: string,
  messageId: string,
  folder: string,
): Promise<void> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") throw new Error("Invalid mail credentials");

    const target = resolveFolder(folder);
    await selectFolder(client, folder);
    const seq = String(parseInt(messageId, 10));

    if (target !== "INBOX.Trash") {
      const copy = await client.command(`COPY ${seq} ${imapQuote("INBOX.Trash")}`);
      if (copy.status !== "OK") throw new Error("Failed to move to Trash");
    }
    await client.command(`STORE ${seq} +FLAGS (\\Deleted)`);
    await client.command("EXPUNGE");
  } finally {
    await client.close();
    currentFolder = null;
  }
}

export async function markHostingerAsRead(
  email: string,
  password: string,
  messageId: string,
  folder: string,
): Promise<void> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") throw new Error("Invalid mail credentials");

    await selectFolder(client, folder);
    const seq = String(parseInt(messageId, 10));
    await client.command(`STORE ${seq} +FLAGS (\\Seen)`);
  } finally {
    await client.close();
    currentFolder = null;
  }
}

export async function getHostingerUnreadCount(
  email: string,
  password: string,
): Promise<number> {
  const client = new ImapClient();
  try {
    await client.connect();
    const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
    if (login.status !== "OK") return 0;
    await selectFolder(client, "inbox");
    const unseen = await searchIds(client, "UNSEEN");
    return unseen.length;
  } catch {
    return 0;
  } finally {
    await client.close();
    currentFolder = null;
  }
}

// ── SMTP send ────────────────────────────────────────────────

export interface SmtpAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

function b64Bytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sendViaHostingerSmtp(
  email: string,
  password: string,
  to: string,
  subject: string,
  bodyHtml: string,
  attachments: SmtpAttachment[],
  inReplyTo?: string,
  references?: string,
): Promise<void> {
  const conn = await Deno.connectTls({
    hostname: HOSTINGER_CONFIG.smtpServer,
    port: HOSTINGER_CONFIG.smtpPort,
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buf = new Uint8Array(0);

  async function readReply(): Promise<string> {
    let acc = buf;
    for (;;) {
      const idx = acc.indexOf(13);
      if (idx !== -1 && acc[idx + 1] === 10) {
        const line = decoder.decode(acc.slice(0, idx));
        // Multi-line replies: "250-..." continues, "250 ..." final
        if (line.length >= 4 && line[3] === "-") {
          acc = acc.slice(idx + 2);
          continue;
        }
        return line;
      }
      const chunk = new Uint8Array(8192);
      const n = await conn.read(chunk);
      if (n === null) throw new Error("SMTP connection closed");
      const merged = new Uint8Array(acc.length + n);
      merged.set(acc);
      merged.set(chunk.slice(0, n), acc.length);
      acc = merged;
    }
  }

  async function cmd(command: string, expectCode = 250): Promise<string> {
    await conn.write(encoder.encode(`${command}\r\n`));
    const reply = await readReply();
    const code = parseInt(reply.slice(0, 3), 10);
    if (code >= 400) throw new Error(`SMTP error: ${reply}`);
    void expectCode;
    return reply;
  }

  try {
    await readReply(); // banner
    await cmd(`EHLO teamstuff.local`, 250);
    const authPlain = btoa(`\0${email}\0${password}`);
    await cmd(`AUTH PLAIN ${authPlain}`, 235);
    await cmd(`MAIL FROM:<${email}>`, 250);
    await cmd(`RCPT TO:<${to}>`, 250);
    await cmd("DATA", 354);

    const boundary = `teamstuff_${crypto.randomUUID().replace(/-/g, "")}`;
    let mime =
      `From: ${email}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n`;
    if (inReplyTo) mime += `In-Reply-To: ${inReplyTo}\r\n`;
    if (references) mime += `References: ${references}\r\n`;
    mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    mime +=
      `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: 8bit\r\n\r\n${bodyHtml}\r\n`;
    for (const att of attachments) {
      mime +=
        `--${boundary}\r\nContent-Type: ${att.contentType}; name="${att.filename}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
        `${b64Bytes(att.content)}\r\n`;
    }
    mime += `--${boundary}--`;

    // Dot-stuffing per RFC 5321
    const stuffed = mime.replace(/(^|\r\n)\./g, "$1..");
    await conn.write(encoder.encode(`${stuffed}\r\n.\r\n`));
    const finalReply = await readReply();
    if (parseInt(finalReply.slice(0, 3), 10) >= 400) {
      throw new Error(`SMTP error: ${finalReply}`);
    }
    await conn.write(encoder.encode("QUIT\r\n"));

    // Save a copy to the Sent folder via IMAP (best-effort)
    try {
      const client = new ImapClient();
      await client.connect();
      const login = await client.command(`LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
      if (login.status === "OK") {
        await client.append("INBOX.Sent", "\\Seen", encoder.encode(mime));
      }
      await client.close();
    } catch {
      // Sent-copy failure is non-fatal (matches legacy behavior)
    }
  } finally {
    try {
      conn.close();
    } catch { /* ignore */ }
  }
}

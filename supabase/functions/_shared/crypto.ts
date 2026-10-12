// AES-GCM encryption for mail credentials at rest.
// Key comes from the MAIL_ENCRYPTION_KEY secret (base64, 32 bytes).
// Never leaves the Edge Function runtime.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedRawBytes: Uint8Array | null = null;
let cachedAesKey: CryptoKey | null = null;

async function getRawBytes(): Promise<Uint8Array> {
  if (cachedRawBytes) return cachedRawBytes;
  const raw = Deno.env.get("MAIL_ENCRYPTION_KEY");
  if (!raw) throw new Error("MAIL_ENCRYPTION_KEY secret is not set");
  const rawBytes = Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0));
  if (rawBytes.length !== 32) {
    throw new Error("MAIL_ENCRYPTION_KEY must be 32 bytes (base64)");
  }
  cachedRawBytes = rawBytes;
  return rawBytes;
}

async function getAesKey(): Promise<CryptoKey> {
  if (cachedAesKey) return cachedAesKey;
  const rawBytes = await getRawBytes();
  cachedAesKey = await crypto.subtle.importKey(
    "raw",
    rawBytes,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  return cachedAesKey;
}

export async function encryptCredential(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let bin = "";
  for (const b of combined) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function decryptCredential(encoded: string): Promise<string> {
  const key = await getAesKey();
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return decoder.decode(plaintext);
}

// HMAC-signed, short-lived state token for the Google OAuth round-trip.
// Stateless: lets the callback know which user initiated the flow
// without a DB round-trip or cookies.

export interface OAuthState {
  uid: string;
  exp: number; // epoch seconds
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<string> {
  const rawBytes = await getRawBytes();
  const key = await crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

export async function signOAuthState(uid: string): Promise<string> {
  const state: OAuthState = {
    uid,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const payload = b64urlEncode(encoder.encode(JSON.stringify(state)));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyOAuthState(state: string): Promise<OAuthState | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  // constant-time-ish comparison
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(decoder.decode(b64urlDecode(payload))) as OAuthState;
    if (!parsed.uid || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Generates a PBKDF2-SHA256 password hash for the master SaaS admin.
// Usage: node scripts/hash-password.mjs "MyPassword123"
const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const toHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
  "deriveBits",
]);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 },
  keyMaterial,
  256,
);

const stored = `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
console.log(`Hash (paste into master_admins.password_hash):\n${stored}`);
console.log("Format: pbkdf2:<saltHex>:<hashHex> (accepted by masterLogin verifyPassword)");

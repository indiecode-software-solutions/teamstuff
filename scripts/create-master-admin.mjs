import fs from "node:fs";
import path from "node:path";

// Read environment variables from .env
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
}

const supabaseUrl = env["VITE_SUPABASE_URL"];
const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const email = (process.argv[2] || "admin@indiecode.in").trim().toLowerCase();
const password = process.argv[3] || "lolo";
const name = process.argv[4] || "Pranav Patil";

const toHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function hashPassword(plain) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 },
    keyMaterial,
    256,
  );
  return `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

async function run() {
  console.log(`Setting up Master Admin for ${email}...`);
  const passwordHash = await hashPassword(password);

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // 1. Check/create in Supabase Auth via Admin API
  let authUserId = null;

  // List existing users
  const listResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  const listData = await listResp.json();
  const existingUser = listData?.users?.find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (existingUser) {
    authUserId = existingUser.id;
    console.log(`Found existing auth user: ${authUserId}`);
    const updateResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { master: true },
      }),
    });
    if (!updateResp.ok) {
      const err = await updateResp.text();
      console.warn("Failed to update auth password:", err);
    } else {
      console.log("Updated auth user credentials.");
    }
  } else {
    console.log("Creating new auth user...");
    const createResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { master: true },
      }),
    });
    const createdData = await createResp.json();
    if (!createResp.ok) {
      console.error("Failed to create auth user:", createdData);
      process.exit(1);
    }
    authUserId = createdData.id || createdData.user?.id;
    console.log(`Created auth user: ${authUserId}`);
  }

  // 2. Insert or update in public.master_admins
  const getAdminResp = await fetch(
    `${supabaseUrl}/rest/v1/master_admins?email=ilike.${encodeURIComponent(email)}&select=id`,
    { headers },
  );
  const existingAdmins = await getAdminResp.json();

  if (existingAdmins && existingAdmins.length > 0) {
    const adminId = existingAdmins[0].id;
    console.log(`Updating existing master_admins record ${adminId}...`);
    const updateAdminResp = await fetch(`${supabaseUrl}/rest/v1/master_admins?id=eq.${adminId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        name,
        password_hash: passwordHash,
        auth_user_id: authUserId,
      }),
    });
    if (!updateAdminResp.ok) {
      console.error("Failed to update master_admins:", await updateAdminResp.text());
      process.exit(1);
    }
    console.log("Updated master_admins record.");
  } else {
    console.log("Inserting new record into master_admins...");
    const insertResp = await fetch(`${supabaseUrl}/rest/v1/master_admins`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        email,
        name,
        password_hash: passwordHash,
        auth_user_id: authUserId,
      }),
    });
    if (!insertResp.ok) {
      console.error("Failed to insert into master_admins:", await insertResp.text());
      process.exit(1);
    }
    console.log("Inserted new record into master_admins.");
  }

  console.log("\n✅ Master Admin successfully provisioned!");
  console.log(`- Email:    ${email}`);
  console.log(`- Name:     ${name}`);
  console.log(`- Auth ID:  ${authUserId}`);
  console.log(`- Hash:     ${passwordHash.slice(0, 25)}...`);
}

run().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});

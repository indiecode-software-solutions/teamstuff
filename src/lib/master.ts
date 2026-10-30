import { createServerFn } from "@tanstack/react-start";
import { getAdminClient, hashPassword, verifyPassword, findAuthUserByEmail } from "./master.server";
import {
  destroyCloudinaryAsset,
  isUploadedProfileImage,
  extractCloudinaryPublicId,
} from "./profile-photo";
import { getR2Path, uploadR2Base64, extractR2Key, deleteR2Object } from "./r2-storage";
import { resolveTenantPortalUrl } from "./tenant-brand";

const GB = 1024 * 1024 * 1024;

function makeTempPassword(name: string): string {
  const clean = name.replace(/[^a-zA-Z]/g, "");
  return `${clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : "Admin"}@123`;
}

async function sendCredentialsEmail(
  companyName: string,
  email: string,
  name: string,
  password: string,
  tenantDomain?: string | null,
): Promise<void> {
  const resendKey = process.env["RESEND_API"];
  if (!resendKey) return;
  try {
    const { url: baseUrl, displayUrl: baseDisplayUrl } = resolveTenantPortalUrl(tenantDomain);
    const portalUrl = `${baseUrl.replace(/\/+$/, "")}/login`;
    const portalDisplayUrl = `${baseDisplayUrl.replace(/\/+$/, "")}/login`;
    const from = process.env["EMAIL_FROM"] || "Indiecode HRMS <noreply@indiecode.in>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Your ${companyName} HRMS login credentials`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
          <div style="background:#0f172a;padding:20px 28px;color:#fff;">
            <p style="margin:0;font-size:18px;font-weight:bold;">${companyName}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Corporate HRMS Portal</p>
          </div>
          <div style="padding:28px">
            <p style="margin:0 0 16px;font-size:15px;color:#111">Welcome, ${name}! Your login for <b>${companyName}</b> has been created on the HRMS. You can access the portal at <a href="${portalUrl}" style="color:#2563eb;font-weight:bold;text-decoration:underline;">${portalDisplayUrl}</a>.</p>
            <table style="background:#f4f4f5;border:1px solid #e2e8f0;border-radius:8px;width:100%;font-size:14px;margin-bottom:20px;">
              <tr><td style="padding:8px 16px;color:#64748b">HRMS portal</td><td align="right" style="padding:8px 16px;font-weight:bold;"><a href="${portalUrl}" style="color:#2563eb;text-decoration:none;">${portalDisplayUrl} &rarr;</a></td></tr>
              <tr><td style="padding:8px 16px;color:#64748b">Login email</td><td align="right" style="padding:8px 16px;font-weight:bold;color:#0f172a">${email}</td></tr>
              <tr><td style="padding:8px 16px;color:#64748b">Temporary password</td><td align="right" style="padding:8px 16px;font-weight:bold;color:#0f172a">${password}</td></tr>
            </table>
            <div style="text-align:center;margin:20px 0 16px 0;">
              <a href="${portalUrl}" style="background:#0f172a;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">Access HRMS Portal &rarr;</a>
            </div>
            <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Please change this password after your first login.</p>
          </div>
        </div>`,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("Resend credentials email error:", resp.status, errBody.slice(0, 500));
    }
  } catch (err) {
    console.error("Resend credentials error:", err);
  }
}

/**
 * Verify master admin credentials against master_admins, then provision a
 * Supabase Auth user (auto-created on first login) so the /master session
 * can be established with regular password login on the master login page.
 */
export const masterLogin = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    const { email, password } = data;

    const { data: admins } = await admin
      .from("master_admins")
      .select("id, email, name, password_hash, auth_user_id")
      .ilike("email", email.trim())
      .maybeSingle();
    if (!admins) return { success: false, error: "Invalid credentials" };
    if (!(await verifyPassword(password, admins.password_hash))) {
      return { success: false, error: "Invalid credentials" };
    }

    try {
      let authUser = admins.auth_user_id
        ? (await admin.auth.admin.getUserById(admins.auth_user_id)).data.user
        : null;
      if (!authUser) {
        authUser = await findAuthUserByEmail(admin, email);
      }

      if (authUser) {
        await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
        });
        await admin.from("master_admins").update({ auth_user_id: authUser.id }).eq("id", admins.id);
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: email.toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { master: true },
        });
        if (error) return { success: false, error: error.message };
        await admin
          .from("master_admins")
          .update({ auth_user_id: created.user.id })
          .eq("id", admins.id);
      }

      return { success: true };
    } catch (err: any) {
      console.error("Master login provisioning error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * True if the given auth user id is a platform owner (master admin).
 * Used to exempt the SaaS owner from company-level gates (e.g. suspension).
 */
export const isMasterAdmin = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false };
    const { data: me } = await admin
      .from("master_admins")
      .select("id")
      .eq("auth_user_id", data.userId)
      .maybeSingle();
    return { success: !!me };
  });

export interface MasterCompany {
  id: string;
  name: string;
  short_name: string;
  tenant_domain: string;
  plan: string;
  seat_limit: number;
  storage_quota_gb: number;
  status: string;
  created_at?: string;
  employeeCount: number;
  usedBytes: number;
  brand_color?: string;
  logo_url?: string;
  brand_tagline?: string;
  login_hero_url?: string;
  favicon_url?: string;
}

export const getMasterDashboard = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      error?: string;
      adminName?: string;
      stats?: {
        companies: number;
        employees: number;
        activeCompanies: number;
        suspendedCompanies: number;
        totalQuotaBytes: number;
        totalUsedBytes: number;
      };
      companies?: MasterCompany[];
    }> => {
      const admin = getAdminClient();
      if (!admin) return { success: false, error: "Database configuration error" };

      const { data: me } = await admin
        .from("master_admins")
        .select("id, name")
        .eq("auth_user_id", data.userId)
        .maybeSingle();
      if (!me) return { success: false, error: "Not authorized" };

      let companies: any[] | null = null;
      let error: any = null;

      const primaryRes = await admin
        .from("companies")
        .select(
          "id, name, short_name, tenant_domain, plan, seat_limit, storage_quota_gb, status, created_at, brand_color, logo_url, brand_tagline, login_hero_url, favicon_url",
        )
        .order("created_at", { ascending: false });

      if (
        primaryRes.error &&
        (primaryRes.error.code === "42703" ||
          primaryRes.error.code === "PGRST204" ||
          primaryRes.error.message?.includes("favicon_url"))
      ) {
        const fallbackRes = await admin
          .from("companies")
          .select(
            "id, name, short_name, tenant_domain, plan, seat_limit, storage_quota_gb, status, created_at, brand_color, logo_url, brand_tagline, login_hero_url",
          )
          .order("created_at", { ascending: false });
        companies = fallbackRes.data;
        error = fallbackRes.error;
      } else {
        companies = primaryRes.data;
        error = primaryRes.error;
      }

      if (error) return { success: false, error: error.message };

      const { data: profileRows } = await admin.from("profiles").select("company_id");
      const empCounts: Record<string, number> = {};
      (profileRows || []).forEach((p: any) => {
        empCounts[p.company_id] = (empCounts[p.company_id] || 0) + 1;
      });

      const { data: fileRows } = await admin
        .from("files")
        .select("company_id, size_bytes")
        .is("deleted_at", null);
      const usedBytes: Record<string, number> = {};
      (fileRows || []).forEach((f: any) => {
        usedBytes[f.company_id] = (usedBytes[f.company_id] || 0) + (Number(f.size_bytes) || 0);
      });

      const list: MasterCompany[] = (companies || []).map((c: any) => ({
        id: c.id,
        name: c.name || "",
        short_name: c.short_name || "",
        tenant_domain: c.tenant_domain || "",
        plan: c.plan || "Starter",
        seat_limit: Number(c.seat_limit) || 50,
        storage_quota_gb: Number(c.storage_quota_gb) || 5,
        status: c.status || "active",
        created_at: c.created_at,
        employeeCount: empCounts[c.id] || 0,
        usedBytes: usedBytes[c.id] || 0,
        brand_color: c.brand_color || "#059669",
        logo_url: c.logo_url || null,
        brand_tagline: c.brand_tagline || null,
        login_hero_url: c.login_hero_url || null,
        favicon_url: c.favicon_url || null,
      }));

      const stats = {
        companies: list.length,
        employees: list.reduce((a, c) => a + c.employeeCount, 0),
        activeCompanies: list.filter((c) => c.status === "active").length,
        suspendedCompanies: list.filter((c) => c.status === "suspended").length,
        totalQuotaBytes: list.reduce((a, c) => a + (c.storage_quota_gb * Math.max(1, c.employeeCount)) * GB, 0),
        totalUsedBytes: list.reduce((a, c) => a + c.usedBytes, 0),
      };

      return { success: true, adminName: me.name, stats, companies: list };
    },
  );

export interface OnboardCompanyParams {
  name: string;
  shortName: string;
  tenantDomain: string;
  plan: string;
  seatLimit: number;
  storageQuotaGb: number;
  adminEmail?: string;
  adminName?: string;
  brandColor?: string;
  logoUrl?: string;
  brandTagline?: string;
  loginHeroUrl?: string;
  faviconUrl?: string;
}

export const masterOnboardCompany = createServerFn({ method: "POST" })
  .validator((d: OnboardCompanyParams) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    try {
      const tenantDomainVal = data.tenantDomain?.trim() || null;

      const insertPayload: Record<string, any> = {
        name: data.name.trim(),
        short_name: data.shortName.trim(),
        tenant_domain: tenantDomainVal,
        plan: data.plan,
        seat_limit: data.seatLimit,
        storage_quota_gb: data.storageQuotaGb,
        status: "active",
        brand_color: data.brandColor?.trim() || "#059669",
        logo_url: data.logoUrl?.trim() || null,
        brand_tagline: data.brandTagline?.trim() || null,
        login_hero_url: data.loginHeroUrl?.trim() || null,
      };
      if (data.faviconUrl?.trim()) {
        insertPayload["favicon_url"] = data.faviconUrl.trim();
      }

      let { data: company, error } = await admin
        .from("companies")
        .insert(insertPayload)
        .select("id")
        .single();

      if (
        error &&
        insertPayload["favicon_url"] &&
        (error.code === "42703" ||
          error.code === "PGRST204" ||
          error.message?.includes("favicon_url"))
      ) {
        delete insertPayload["favicon_url"];
        const retry = await admin
          .from("companies")
          .insert(insertPayload)
          .select("id")
          .single();
        company = retry.data;
        error = retry.error;
      }

      if (error) return { success: false, error: error.message };

      let credentials: { email: string; password: string } | undefined;

      // Optional: auto-create a company admin (HR) as an auth user
      if (data.adminEmail?.trim()) {
        const adminEmail = data.adminEmail.trim().toLowerCase();
        const firstName = (data.adminName || data.adminEmail).trim().split(" ")[0] || "Admin";
        const tempPassword = makeTempPassword(firstName);

        let authUser = await findAuthUserByEmail(admin, adminEmail);
        if (authUser) {
          await admin.auth.admin.updateUserById(authUser.id, {
            password: tempPassword,
            email_confirm: true,
          });
        } else {
          const { data: created, error: authErr } = await admin.auth.admin.createUser({
            email: adminEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { name: data.adminName || "Company Admin" },
          });
          if (authErr) return { success: false, error: authErr.message };
          authUser = created.user;
        }

        const profileData = {
          id: authUser.id,
          company_id: company.id,
          name: data.adminName || "Company Admin",
          email: adminEmail,
          role: "admin",
          job_title: "Company Admin",
          onboarding_status: "Pending",
        };

        const { error: profileErr } = await admin
          .from("profiles")
          .upsert(profileData, { onConflict: "id" });

        if (profileErr) {
          return { success: false, error: profileErr.message };
        }

        credentials = { email: adminEmail, password: tempPassword };

        // Email the new admin their credentials via Resend
        await sendCredentialsEmail(
          data.name.trim(),
          adminEmail,
          data.adminName || "Company Admin",
          tempPassword,
          data.tenantDomain,
        );
      }

      return { success: true, companyId: company.id, credentials };
    } catch (err: any) {
      console.error("Master onboard company error:", err);
      return { success: false, error: err.message };
    }
  });

export interface UpdateCompanyParams {
  companyId: string;
  name: string;
  shortName: string;
  tenantDomain: string;
  plan: string;
  seatLimit: number;
  storageQuotaGb: number;
  status: string;
  brandColor?: string;
  logoUrl?: string;
  brandTagline?: string;
  loginHeroUrl?: string;
  faviconUrl?: string;
}

export const masterUpdateCompany = createServerFn({ method: "POST" })
  .validator((d: UpdateCompanyParams) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };
    try {
      const tenantDomainVal = data.tenantDomain?.trim() || null;

      const updatePayload: Record<string, any> = {
        name: data.name.trim(),
        short_name: data.shortName.trim(),
        tenant_domain: tenantDomainVal,
        plan: data.plan,
        seat_limit: data.seatLimit,
        storage_quota_gb: data.storageQuotaGb,
        status: data.status,
        brand_color: data.brandColor?.trim() || "#059669",
        logo_url: data.logoUrl?.trim() || null,
        brand_tagline: data.brandTagline?.trim() || null,
        login_hero_url: data.loginHeroUrl?.trim() || null,
      };
      if (data.faviconUrl !== undefined) {
        updatePayload["favicon_url"] = data.faviconUrl?.trim() || null;
      }

      let { error } = await admin
        .from("companies")
        .update(updatePayload)
        .eq("id", data.companyId);

      if (
        error &&
        updatePayload["favicon_url"] !== undefined &&
        (error.code === "42703" ||
          error.code === "PGRST204" ||
          error.message?.includes("favicon_url"))
      ) {
        delete updatePayload["favicon_url"];
        const retry = await admin
          .from("companies")
          .update(updatePayload)
          .eq("id", data.companyId);
        error = retry.error;
      }

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

export const masterToggleCompanyStatus = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; status: "active" | "suspended" }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };
    try {
      const { error } = await admin
        .from("companies")
        .update({ status: data.status })
        .eq("id", data.companyId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

export interface AddUserParams {
  userId: string;
  companyId: string;
  name: string;
  email: string;
  role: "admin" | "hr" | "employee";
  jobTitle?: string | undefined;
}

const defaultJobTitle = (role: AddUserParams["role"]): string =>
  role === "admin" ? "Company Admin" : role === "hr" ? "HR Manager" : "Employee";

/**
 * Add a user (admin / HR / employee) to an existing company from the SaaS
 * console. Creates the Supabase Auth user (or reuses one left behind by a
 * deleted profile), inserts the profile and emails credentials.
 */
export const masterAddUser = createServerFn({ method: "POST" })
  .validator((d: AddUserParams) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      error?: string;
      credentials?: { email: string; password: string };
    }> => {
      const admin = getAdminClient();
      if (!admin) return { success: false, error: "Database configuration error" };

      const { data: me } = await admin
        .from("master_admins")
        .select("id")
        .eq("auth_user_id", data.userId)
        .maybeSingle();
      if (!me) return { success: false, error: "Not authorized" };

      const name = data.name.trim();
      const email = data.email.trim().toLowerCase();
      if (!name || !email) return { success: false, error: "Name and email are required." };

      try {
        const { data: company } = await admin
          .from("companies")
          .select("id, name, seat_limit, tenant_domain")
          .eq("id", data.companyId)
          .single();
        if (!company) return { success: false, error: "Company not found." };

        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", data.companyId);
        if (company.seat_limit != null && (count || 0) >= company.seat_limit) {
          return {
            success: false,
            error: `Seat limit reached (${company.seat_limit}). Raise the limit before adding users.`,
          };
        }

        const tempPassword = makeTempPassword(name.split(" ")[0] || "Admin");

        let authUser = await findAuthUserByEmail(admin, email);
        if (authUser) {
          await admin.auth.admin.updateUserById(authUser.id, {
            password: tempPassword,
            email_confirm: true,
          });
        } else {
          const { data: created, error } = await admin.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { name },
          });
          if (error) return { success: false, error: error.message };
          authUser = created.user;
        }

        const profileFields = {
          name,
          email,
          role: data.role,
          job_title: data.jobTitle?.trim() || defaultJobTitle(data.role),
        };

        // Idempotent recovery: if a profile already exists for this auth user
        // in the same company, re-link it instead of failing on a duplicate key.
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id, company_id")
          .eq("id", authUser.id)
          .maybeSingle();
        if (existingProfile) {
          if (existingProfile.company_id && existingProfile.company_id !== data.companyId) {
            return {
              success: false,
              error:
                "This email already belongs to another company. Use a different email or remove that profile first.",
            };
          }
          const { error: relinkErr } = await admin
            .from("profiles")
            .update(profileFields)
            .eq("id", authUser.id);
          if (relinkErr) return { success: false, error: relinkErr.message };
          await sendCredentialsEmail(company.name || "your company", email, name, tempPassword, company.tenant_domain);
          return { success: true, credentials: { email, password: tempPassword } };
        }

        const { error: profileErr } = await admin.from("profiles").insert({
          id: authUser.id,
          company_id: data.companyId,
          ...profileFields,
          onboarding_status: "Pending",
        });

        // Stale state / race: profile appeared between check and insert.
        if (profileErr && profileErr.code === "23505") {
          const { data: racedProfile } = await admin
            .from("profiles")
            .select("company_id")
            .eq("id", authUser.id)
            .maybeSingle();
          if (racedProfile?.company_id === data.companyId) {
            const { error: relinkErr } = await admin
              .from("profiles")
              .update(profileFields)
              .eq("id", authUser.id);
            if (relinkErr) return { success: false, error: relinkErr.message };
            await sendCredentialsEmail(company.name || "your company", email, name, tempPassword, company.tenant_domain);
            return { success: true, credentials: { email, password: tempPassword } };
          }
        }

        if (profileErr) return { success: false, error: profileErr.message };

        await sendCredentialsEmail(company.name || "your company", email, name, tempPassword, company.tenant_domain);

        return { success: true, credentials: { email, password: tempPassword } };
      } catch (err: any) {
        console.error("Master add user error:", err);
        return { success: false, error: err.message };
      }
    },
  );

export const masterDeleteCompany = createServerFn({ method: "POST" })
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };
    try {
      const { data: profileRows } = await admin
        .from("profiles")
        .select("id, profile_photo")
        .eq("company_id", data.companyId);
      const userIds = (profileRows || []).map((p: any) => p.id);

      // Clean up uploaded profile photos before the profile rows are deleted
      for (const p of profileRows || []) {
        if (isUploadedProfileImage(p.profile_photo)) {
          const r2Key = extractR2Key(p.profile_photo);
          if (r2Key) {
            await deleteR2Object(r2Key).catch(() => {});
          } else {
            const publicId = extractCloudinaryPublicId(p.profile_photo);
            if (publicId) {
              await destroyCloudinaryAsset(publicId).catch(() => {});
            }
          }
        }
      }

      await admin.from("profiles").delete().eq("company_id", data.companyId);

      for (const uid of userIds) {
        await admin.auth.admin
          .deleteUser(uid)
          .catch((err: any) =>
            console.warn(`Master delete: auth user ${uid} not removed:`, err.message),
          );
      }

      const { error } = await admin.from("companies").delete().eq("id", data.companyId);
      if (error) return { success: false, error: error.message };

      return { success: true, removedUsers: userIds.length };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

/**
 * Master Admin server function to upload a company's Login Hero Image directly to Cloudflare R2
 * (Stored in: companies/<companyId>/branding/login_hero_<timestamp>.webp)
 */
export const masterUploadCompanyLoginHero = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId?: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; secure_url?: string; error?: string }> => {
    const { base64Data, companyId } = data;
    const key = getR2Path.loginHero(companyId || "general", "webp");

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
        contentType: "image/webp",
      });

      if (!res.success) {
        throw new Error(res.error || "R2 company login hero upload failed");
      }

      return { success: true, secure_url: res.url };
    } catch (err: any) {
      console.error("R2 company login hero upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

/**
 * Master Admin server function to upload a company's Logo directly to Cloudflare R2
 * (Stored in: companies/<companyId>/branding/logo_<timestamp>.webp)
 */
export const masterUploadCompanyLogo = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId?: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; secure_url?: string; error?: string }> => {
    const { base64Data, companyId } = data;
    const key = getR2Path.companyLogo(companyId || "general", "webp");

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
        contentType: "image/webp",
      });

      if (!res.success) {
        throw new Error(res.error || "R2 company logo upload failed");
      }

      return { success: true, secure_url: res.url };
    } catch (err: any) {
      console.error("R2 company logo upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

/**
 * Master Admin server function to upload a company's Favicon directly to Cloudflare R2
 * (Stored in: system/master/favicon/<timestamp>_favicon.ico)
 */
export const masterUploadCompanyFavicon = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId?: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; secure_url?: string; error?: string }> => {
    const { base64Data, companyId } = data;
    const key = getR2Path.masterAdminAsset("favicon", `favicon_${companyId || "general"}.ico`);

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
        contentType: "image/x-icon",
      });

      if (!res.success) {
        throw new Error(res.error || "R2 company favicon upload failed");
      }

      return { success: true, secure_url: res.url };
    } catch (err: any) {
      console.error("R2 company favicon upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

export interface MasterEmployee {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: "admin" | "hr" | "employee";
  job_title?: string | null;
  department?: string | null;
  employee_code?: string | null;
  work_location?: string | null;
  employment_type?: string | null;
  onboarding_status?: string | null;
  profile_photo?: string | null;
  reporting_to?: string | null;
  reporting_to_name?: string | null;
  date_of_joining?: string | null;
  phone?: string | null;
  created_at?: string | null;
}

export const masterGetCompanyEmployees = createServerFn({ method: "POST" })
  .validator((d: { userId: string; companyId: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      error?: string;
      companyName?: string;
      employees?: MasterEmployee[];
    }> => {
      const admin = getAdminClient();
      if (!admin) return { success: false, error: "Database configuration error" };

      const { data: me } = await admin
        .from("master_admins")
        .select("id")
        .eq("auth_user_id", data.userId)
        .maybeSingle();
      if (!me) return { success: false, error: "Not authorized" };

      const { data: company } = await admin
        .from("companies")
        .select("id, name")
        .eq("id", data.companyId)
        .maybeSingle();
      if (!company) return { success: false, error: "Company not found" };

      const { data: profiles, error } = await admin
        .from("profiles")
        .select(
          "id, company_id, name, email, role, job_title, department, employee_code, work_location, employment_type, onboarding_status, profile_photo, reporting_to, date_of_joining, phone, created_at",
        )
        .eq("company_id", data.companyId)
        .order("name", { ascending: true });

      if (error) return { success: false, error: error.message };

      // Map reporting_to names
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        if (p.id && p.name) nameMap[p.id] = p.name;
      });

      const employees: MasterEmployee[] = (profiles || []).map((p: any) => ({
        id: p.id,
        company_id: p.company_id,
        name: p.name || "Unnamed Employee",
        email: p.email || "",
        role: (p.role as "admin" | "hr" | "employee") || "employee",
        job_title: p.job_title || null,
        department: p.department || null,
        employee_code: p.employee_code || null,
        work_location: p.work_location || null,
        employment_type: p.employment_type || null,
        onboarding_status: p.onboarding_status || null,
        profile_photo: p.profile_photo || null,
        reporting_to: p.reporting_to || null,
        reporting_to_name: p.reporting_to ? nameMap[p.reporting_to] || null : null,
        date_of_joining: p.date_of_joining || null,
        phone: p.phone || null,
        created_at: p.created_at || null,
      }));

      return { success: true, companyName: company.name, employees };
    },
  );

export const masterDeleteEmployee = createServerFn({ method: "POST" })
  .validator((d: { userId: string; companyId: string; employeeId: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    const { data: me } = await admin
      .from("master_admins")
      .select("id")
      .eq("auth_user_id", data.userId)
      .maybeSingle();
    if (!me) return { success: false, error: "Not authorized" };

    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, profile_photo")
        .eq("id", data.employeeId)
        .eq("company_id", data.companyId)
        .maybeSingle();

      if (!profile) return { success: false, error: "Employee not found." };

      if (isUploadedProfileImage(profile.profile_photo)) {
        const r2Key = extractR2Key(profile.profile_photo);
        if (r2Key) {
          await deleteR2Object(r2Key).catch(() => {});
        } else {
          const publicId = extractCloudinaryPublicId(profile.profile_photo);
          if (publicId) {
            await destroyCloudinaryAsset(publicId).catch(() => {});
          }
        }
      }

      await admin.from("profiles").delete().eq("id", data.employeeId);

      await admin.auth.admin
        .deleteUser(data.employeeId)
        .catch((err: any) => console.warn(`Master delete user auth error:`, err.message));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

export const masterResetEmployeePassword = createServerFn({ method: "POST" })
  .validator((d: { userId: string; companyId: string; employeeId: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      error?: string;
      credentials?: { email: string; password: string; name: string };
    }> => {
      const admin = getAdminClient();
      if (!admin) return { success: false, error: "Database configuration error" };

      const { data: me } = await admin
        .from("master_admins")
        .select("id")
        .eq("auth_user_id", data.userId)
        .maybeSingle();
      if (!me) return { success: false, error: "Not authorized" };

      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("id, name, email")
          .eq("id", data.employeeId)
          .eq("company_id", data.companyId)
          .maybeSingle();
        if (!profile) return { success: false, error: "Employee not found." };

        const { data: company } = await admin
          .from("companies")
          .select("name, tenant_domain")
          .eq("id", data.companyId)
          .single();

        const firstName = profile.name.trim().split(" ")[0] || "Employee";
        const tempPassword = makeTempPassword(firstName);

        const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
          password: tempPassword,
          email_confirm: true,
        });
        if (authErr) return { success: false, error: authErr.message };

        await sendCredentialsEmail(
          company?.name || "your company",
          profile.email,
          profile.name,
          tempPassword,
          company?.tenant_domain,
        );

        return {
          success: true,
          credentials: { email: profile.email, password: tempPassword, name: profile.name },
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  );

/** Hash helper exposed for bootstrapping extra admins via scripts. */
export { hashPassword };


import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { supabase } from "./supabase";
import { migrateCompanyR2Prefix } from "./cloud-drive";
import { getR2Path, uploadR2Base64 } from "./r2-storage";

export type CompanyLogoDisplay = "logo_and_name" | "logo_only";

export interface CompanyBranding {
  name: string;
  shortName: string;
  logoUrl: string | null;
  logoDisplay: CompanyLogoDisplay | null;
  brandColor?: string | null;
  brandTagline?: string | null;
  tenantDomain?: string | null;
  loginHeroUrl?: string | null;
  faviconUrl?: string | null;
  chatMode?: "anonymous" | "transparent" | null;
  allowTeamLeadPolls?: boolean | null;
}

// Module-level cache: branding is read often (every sidebar mount) but changes
// rarely, and there is no state store in this app. Invalidated after saving in
// the Company Profile settings, and subscribers are notified so mounted
// sidebars re-render immediately.
let cachedBranding: CompanyBranding | null = null;

type BrandingListener = () => void;
const listeners = new Set<BrandingListener>();

export function subscribeCompanyBranding(listener: BrandingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateCompanyBrandingCache() {
  cachedBranding = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("company_branding");
    } catch (e) {}
  }
  listeners.forEach((l) => l());
}

/**
 * Synchronous accessor for already-loaded branding (module-level cache + localStorage), so
 * sidebar renders and tab titles are instantly stable at 0ms across route changes without an async swap or flash.
 */
export function getCachedCompanyBranding(): CompanyBranding | null {
  if (cachedBranding) return cachedBranding;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("company_branding");
      if (raw) {
        cachedBranding = JSON.parse(raw) as CompanyBranding;
        return cachedBranding;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Load the signed-in user's company branding (name, short name, logo URL and
 * the sidebar display preference). Falls back to a neutral Teamstuff brand.
 */
export async function getCompanyBranding(): Promise<CompanyBranding | null> {
  let targetCompanyId: string | null = null;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("impersonated_company");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) targetCompanyId = parsed.id;
      }
    } catch (e) {}
  }

  if (cachedBranding && !targetCompanyId) return cachedBranding;
  try {
    if (!targetCompanyId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (!profile?.company_id) return null;
      targetCompanyId = profile.company_id;
    }

    let comp: any = null;
    const res = await supabase
      .from("companies")
      .select("name, short_name, logo_url, logo_display, brand_color, brand_tagline, tenant_domain, login_hero_url, favicon_url, chat_mode")
      .eq("id", targetCompanyId)
      .maybeSingle();

    if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204" || res.error.message?.includes("favicon_url") || res.error.message?.includes("chat_mode"))) {
      const fb = await supabase
        .from("companies")
        .select("name, short_name, logo_url, logo_display, brand_color, brand_tagline, tenant_domain, login_hero_url")
        .eq("id", targetCompanyId)
        .maybeSingle();
      comp = fb.data;
    } else {
      comp = res.data;
    }

    const branding: CompanyBranding | null = comp
      ? {
          name: comp.name || "Teamstuff",
          shortName: comp.short_name || comp.name || "Teamstuff",
          logoUrl: comp.logo_url || null,
          logoDisplay: (comp.logo_display as CompanyLogoDisplay) || null,
          brandColor: comp.brand_color || "#059669",
          brandTagline: comp.brand_tagline || null,
          tenantDomain: comp.tenant_domain || null,
          loginHeroUrl: comp.login_hero_url || null,
          faviconUrl: comp.favicon_url || null,
          chatMode: (comp.chat_mode as "anonymous" | "transparent") || "anonymous",
        }
      : null;

    cachedBranding = branding;
    if (branding && !targetCompanyId && typeof window !== "undefined") {
      try {
        localStorage.setItem("company_branding", JSON.stringify(branding));
      } catch (e) {}
    }
    return branding;
  } catch (err) {
    // Ultimate fallback
    try {
      if (targetCompanyId) {
        const { data: fallbackComp } = await supabase
          .from("companies")
          .select("name, short_name, logo_url, logo_display, brand_color, brand_tagline, tenant_domain, login_hero_url")
          .eq("id", targetCompanyId)
          .maybeSingle();
        if (fallbackComp) {
          const branding: CompanyBranding = {
            name: fallbackComp.name || "Teamstuff",
            shortName: fallbackComp.short_name || fallbackComp.name || "Teamstuff",
            logoUrl: fallbackComp.logo_url || null,
            logoDisplay: (fallbackComp.logo_display as CompanyLogoDisplay) || null,
            brandColor: fallbackComp.brand_color || "#059669",
            brandTagline: fallbackComp.brand_tagline || null,
            tenantDomain: fallbackComp.tenant_domain || null,
            loginHeroUrl: fallbackComp.login_hero_url || null,
            faviconUrl: null,
            chatMode: "anonymous",
          };
          cachedBranding = branding;
          return branding;
        }
      }
    } catch {}
    console.error("Failed to load company branding:", err);
    return null;
  }
}

/**
 * Upload the company logo to the company's branding folder on Cloudflare R2
 * (companies/<companyId>/branding/logo_<timestamp>.webp).
 */
export const uploadCompanyLogo = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const key = getR2Path.companyLogo(companyId, "webp");

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

function getAdminClient() {
  const url = process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export interface SaveCompanyProfileParams {
  companyId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  logoDisplay: CompanyLogoDisplay | null;
  tenantDomain: string;
  workStartTime: string;
  workEndTime: string;
  inductionEnabled: boolean;
  lateMarkPolicyId?: string | null;
  lateGraceMinutes?: number;
  chatMode?: "anonymous" | "transparent";
  allowTeamLeadPolls?: boolean;
}

export interface ProfileSaveResult {
  success: boolean;
  error?: string;
}

/**
 * Persist the company profile with the service role, so the save is never
 * silently filtered by client-side RLS on the companies table.
 */
export const saveCompanyProfile = createServerFn({ method: "POST" })
  .validator((d: SaveCompanyProfileParams) => d)
  .handler(async ({ data }): Promise<ProfileSaveResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };
    try {
      const { data: existing, error: fetchError } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", data.companyId)
        .maybeSingle();
      if (fetchError) throw fetchError;

      const updatePayload: Record<string, any> = {
        name: data.name,
        short_name: data.shortName,
        logo_url: data.logoUrl,
        logo_display: data.logoDisplay,
        tenant_domain: data.tenantDomain,
        default_work_start_time: data.workStartTime,
        default_work_end_time: data.workEndTime,
        late_mark_policy_id: data.lateMarkPolicyId || null,
        late_grace_minutes:
          typeof data.lateGraceMinutes === "number" && !isNaN(data.lateGraceMinutes) && data.lateGraceMinutes >= 0
            ? data.lateGraceMinutes
            : 10,
        induction_enabled: data.inductionEnabled,
      };

      if (data.chatMode) {
        updatePayload["chat_mode"] = data.chatMode;
      }
      if (typeof data.allowTeamLeadPolls === "boolean") {
        updatePayload["allow_team_lead_polls"] = data.allowTeamLeadPolls;
      }

      let { error } = await adminClient
        .from("companies")
        .update(updatePayload)
        .eq("id", data.companyId);

      if (error && (error.code === "PGRST204" || error.message?.includes("late_grace_minutes") || error.message?.includes("chat_mode") || error.message?.includes("allow_team_lead_polls"))) {
        delete updatePayload["late_grace_minutes"];
        delete updatePayload["chat_mode"];
        delete updatePayload["allow_team_lead_polls"];
        const retry = await adminClient
          .from("companies")
          .update(updatePayload)
          .eq("id", data.companyId);
        error = retry.error;
      }
      if (error) throw error;

      if (existing && existing.name !== data.name) {
        const migration = await migrateCompanyR2Prefix({
          data: {
            companyId: data.companyId,
            oldName: existing.name ?? "",
            newName: data.name,
          },
        });
        console.info(`R2 prefix migration for "${existing.name}" -> "${data.name}":`, migration);
      }
      return { success: true };
    } catch (err: any) {
      console.error("Save company profile exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist just the logo URL after a successful Cloudinary upload.
 */
export const saveCompanyLogo = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; logoUrl: string }) => d)
  .handler(async ({ data }): Promise<ProfileSaveResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };
    try {
      const { error } = await adminClient
        .from("companies")
        .update({ logo_url: data.logoUrl })
        .eq("id", data.companyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save company logo exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist the company chat mode ('anonymous' | 'transparent') with service role
 * to prevent silent RLS update rejections on the companies table.
 */
export const saveCompanyChatMode = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; chatMode: "anonymous" | "transparent" }) => d)
  .handler(async ({ data }): Promise<ProfileSaveResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };
    try {
      const { error } = await adminClient
        .from("companies")
        .update({ chat_mode: data.chatMode })
        .eq("id", data.companyId);
      if (error) throw error;
      invalidateCompanyBrandingCache();
      return { success: true };
    } catch (err: any) {
      console.error("Save company chat mode exception:", err);
      return { success: false, error: err.message };
    }
  });


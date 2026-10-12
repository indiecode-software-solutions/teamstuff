import { supabase } from "./supabase";

export interface TenantBranding {
  id: string;
  name: string;
  shortName: string;
  tenantDomain: string | null;
  brandColor: string;
  logoUrl: string | null;
  brandTagline: string | null;
  loginHeroUrl: string | null;
  faviconUrl: string | null;
}

export const DEFAULT_BRAND_COLOR = "#18181b";

export const BRAND_COLOR_PRESETS = [
  { name: "Emerald", hex: "#059669" },
  { name: "Royal Blue", hex: "#2563EB" },
  { name: "Indigo", hex: "#4F46E5" },
  { name: "Violet", hex: "#7C3AED" },
  { name: "Amber", hex: "#D97706" },
  { name: "Crimson", hex: "#E11D48" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Slate", hex: "#334155" },
];

const RESERVED_SUBDOMAINS = new Set([
  "localhost",
  "127.0.0.1",
  "www",
  "app",
  "api",
  "master",
  "admin",
  "portal",
  "preview",
  "intranet",
  "teamstuff",
  "capoasis",
  "corporate-intranet",
]);

/**
 * Extract tenant slug from a plain hostname string (no window required).
 * Works on both server (SSR) and client.
 * Supports:
 * - Subdomain: acme.yoovaventures.com -> "acme"
 * - Localhost subdomain: acme.localhost -> "acme"
 */
export function extractTenantSlugFromHostStr(host: string): string | null {
  try {
    // Strip port if present (e.g. localhost:3000)
    const hostname = host.split(":")[0].toLowerCase();
    const parts = hostname.split(".");

    // Case: acme.localhost
    if (parts.length === 2 && parts[1] === "localhost") {
      const sub = parts[0];
      return RESERVED_SUBDOMAINS.has(sub) ? null : sub;
    }

    // Platform deployment domains: *.vercel.app, *.lovable.app, *.pages.dev, *.netlify.app, etc.
    // e.g. teamstuff.vercel.app has 3 parts (project.vercel.app) where the first part is the app name, NOT a tenant.
    // A tenant on a platform domain would require 4+ parts (e.g. acme.teamstuff.vercel.app).
    const isPlatformHost =
      hostname.endsWith(".vercel.app") ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".pages.dev") ||
      hostname.endsWith(".netlify.app") ||
      hostname.endsWith(".onrender.com") ||
      hostname.endsWith(".railway.app");

    if (isPlatformHost) {
      if (parts.length >= 4) {
        const sub = parts[0];
        return RESERVED_SUBDOMAINS.has(sub) ? null : sub;
      }
      return null;
    }

    // Case: acme.yoovaventures.com or acme.domain.com (3+ parts)
    if (parts.length >= 3) {
      const sub = parts[0];
      return RESERVED_SUBDOMAINS.has(sub) ? null : sub;
    }
  } catch (err) {
    console.warn("Failed to extract tenant from host string:", err);
  }
  return null;
}

/**
 * Extract tenant slug from current browser host or query param.
 * Supports:
 * - Query param: ?tenant=acme (works in dev or local testing)
 * - Subdomain: acme.yoovaventures.com -> "acme"
 * - Localhost subdomain: acme.localhost:8080 -> "acme"
 */
export function getTenantFromHost(): string | null {
  if (typeof window === "undefined") return null;

  try {
    // 1. URL search param check (?tenant=acme)
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get("tenant")?.trim().toLowerCase();
    if (tenantParam && !RESERVED_SUBDOMAINS.has(tenantParam)) {
      return tenantParam;
    }

    // 2. Hostname check
    const hostname = window.location.hostname.toLowerCase();
    return extractTenantSlugFromHostStr(hostname);
  } catch (err) {
    console.warn("Failed to parse tenant from host:", err);
  }

  return null;
}

/**
 * Resolves the full intranet portal URL and display URL based on a tenant domain or slug.
 * Root domain is yoovaventures.com.
 * Examples:
 * - "salado" -> { url: "https://salado.yoovaventures.com", displayUrl: "salado.yoovaventures.com" }
 * - "mmtz" -> { url: "https://mmtz.yoovaventures.com", displayUrl: "mmtz.yoovaventures.com" }
 * - "salado.yoovaventures.com" -> { url: "https://salado.yoovaventures.com", displayUrl: "salado.yoovaventures.com" }
 * - "custom.company.com" -> { url: "https://custom.company.com", displayUrl: "custom.company.com" }
 * - null / "" / "yoovaventures.com" -> { url: "https://yoovaventures.com", displayUrl: "yoovaventures.com" }
 */
export function resolveTenantPortalUrl(tenantDomain?: string | null): {
  url: string;
  displayUrl: string;
} {
  const rootDomain = "yoovaventures.com";
  const raw = (tenantDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!raw || raw === rootDomain) {
    return {
      url: `https://${rootDomain}`,
      displayUrl: rootDomain,
    };
  }

  if (raw.includes(".")) {
    return {
      url: `https://${raw}`,
      displayUrl: raw,
    };
  }

  const fullDomain = `${raw}.${rootDomain}`;
  return {
    url: `https://${fullDomain}`,
    displayUrl: fullDomain,
  };
}

const CACHE_PREFIX = "tenant_brand_cache_";

/**
 * Get tenant branding synchronously from local cache if available (0ms load, prevents layout shifts).
 */
export function getCachedTenantBranding(tenantSlug: string): TenantBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tenantSlug.toLowerCase());
    if (raw) return JSON.parse(raw) as TenantBranding;
  } catch (err) {
    // ignore
  }
  return null;
}

import { createServerFn } from "@tanstack/react-start";
import { getAdminClient } from "./master.server";

/**
 * Server function to fetch tenant branding with service role privileges.
 * Bypasses RLS so unauthenticated visitors on login screens always get the correct company branding.
 */
export const fetchTenantBrandingServerFn = createServerFn({ method: "POST" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<TenantBranding | null> => {
    if (!slug) return null;
    const cleanSlug = slug.trim().toLowerCase();
    const admin = getAdminClient();

    if (!admin) {
      let data: any = null;
      const res = await supabase
        .from("companies")
        .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, favicon_url")
        .or(`tenant_domain.ilike.${cleanSlug},short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
        .eq("status", "active")
        .maybeSingle();

      if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204" || res.error.message?.includes("favicon_url"))) {
        const fallback = await supabase
          .from("companies")
          .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url")
          .or(`tenant_domain.ilike.${cleanSlug},short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
          .eq("status", "active")
          .maybeSingle();
        data = fallback.data;
      } else {
        data = res.data;
      }

      if (!data) return null;
      return {
        id: data.id,
        name: data.name || "CapOasis",
        shortName: data.short_name || data.name || "CapOasis",
        tenantDomain: data.tenant_domain || null,
        brandColor: data.brand_color || DEFAULT_BRAND_COLOR,
        logoUrl: data.logo_url || null,
        brandTagline: data.brand_tagline || null,
        loginHeroUrl: data.login_hero_url || null,
        faviconUrl: data.favicon_url || null,
      };
    }

    // Direct query using service role admin client
    let comp: any = null;
    const compRes = await admin
      .from("companies")
      .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, favicon_url, status")
      .or(`tenant_domain.ilike.${cleanSlug},tenant_domain.ilike.${cleanSlug}.yoovaventures.com,short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
      .eq("status", "active")
      .maybeSingle();

    if (compRes.error && (compRes.error.code === "42703" || compRes.error.code === "PGRST204" || compRes.error.message?.includes("favicon_url"))) {
      const fb = await admin
        .from("companies")
        .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, status")
        .or(`tenant_domain.ilike.${cleanSlug},tenant_domain.ilike.${cleanSlug}.yoovaventures.com,short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
        .eq("status", "active")
        .maybeSingle();
      comp = fb.data;
    } else {
      comp = compRes.data;
    }

    if (comp) {
      return {
        id: comp.id,
        name: comp.name || "CapOasis",
        shortName: comp.short_name || comp.name || "CapOasis",
        tenantDomain: comp.tenant_domain || null,
        brandColor: comp.brand_color || DEFAULT_BRAND_COLOR,
        logoUrl: comp.logo_url || null,
        brandTagline: comp.brand_tagline || null,
        loginHeroUrl: comp.login_hero_url || null,
        faviconUrl: comp.favicon_url || null,
      };
    }

    // Fallback search across all active companies to handle variations
    let allActive: any[] | null = null;
    const allRes = await admin
      .from("companies")
      .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, favicon_url, status")
      .eq("status", "active");

    if (allRes.error && (allRes.error.code === "42703" || allRes.error.code === "PGRST204" || allRes.error.message?.includes("favicon_url"))) {
      const allFb = await admin
        .from("companies")
        .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, status")
        .eq("status", "active");
      allActive = allFb.data;
    } else {
      allActive = allRes.data;
    }

    const slugNormalized = cleanSlug.replace(/[^a-z0-9]/g, "");
    const match = (allActive || []).find((c: any) => {
      const d = (c.tenant_domain || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const s = (c.short_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const n = (c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return d === slugNormalized || s === slugNormalized || n === slugNormalized || d.startsWith(slugNormalized);
    });

    if (match) {
      return {
        id: match.id,
        name: match.name || "CapOasis",
        shortName: match.short_name || match.name || "CapOasis",
        tenantDomain: match.tenant_domain || null,
        brandColor: match.brand_color || DEFAULT_BRAND_COLOR,
        logoUrl: match.logo_url || null,
        brandTagline: match.brand_tagline || null,
        loginHeroUrl: match.login_hero_url || null,
        faviconUrl: match.favicon_url || null,
      };
    }

    return null;
  });

/**
 * Fetch tenant branding by subdomain / slug.
 * Looks up via server function with local cache fallback.
 */
export async function fetchTenantBranding(tenantSlug: string): Promise<TenantBranding | null> {
  if (!tenantSlug) return null;
  const cleanSlug = tenantSlug.trim().toLowerCase();

  // 1. Direct query using client supabase (fastest, guaranteed up-to-date with public RLS)
  try {
    let data: any = null;
    const res = await supabase
      .from("companies")
      .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url, favicon_url")
      .or(`tenant_domain.ilike.${cleanSlug},tenant_domain.ilike.${cleanSlug}.yoovaventures.com,short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
      .eq("status", "active")
      .maybeSingle();

    if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204" || res.error.message?.includes("favicon_url"))) {
      const fallback = await supabase
        .from("companies")
        .select("id, name, short_name, tenant_domain, brand_color, logo_url, brand_tagline, login_hero_url")
        .or(`tenant_domain.ilike.${cleanSlug},tenant_domain.ilike.${cleanSlug}.yoovaventures.com,short_name.ilike.${cleanSlug},name.ilike.${cleanSlug}`)
        .eq("status", "active")
        .maybeSingle();
      data = fallback.data;
    } else {
      data = res.data;
    }

    if (data) {
      const brand: TenantBranding = {
        id: data.id,
        name: data.name || "CapOasis",
        shortName: data.short_name || data.name || "CapOasis",
        tenantDomain: data.tenant_domain || null,
        brandColor: data.brand_color || DEFAULT_BRAND_COLOR,
        logoUrl: data.logo_url || null,
        brandTagline: data.brand_tagline || null,
        loginHeroUrl: data.login_hero_url || null,
        faviconUrl: data.favicon_url || null,
      };
      try {
        localStorage.setItem(CACHE_PREFIX + cleanSlug, JSON.stringify(brand));
      } catch (e) {}
      return brand;
    }
  } catch (err) {
    console.warn("Client supabase tenant lookup warning:", err);
  }

  // 2. Fallback via server function
  try {
    const brand = await fetchTenantBrandingServerFn({ data: cleanSlug });
    if (brand) {
      try {
        localStorage.setItem(CACHE_PREFIX + cleanSlug, JSON.stringify(brand));
      } catch (e) {}
      return brand;
    }
  } catch (err) {
    console.warn("ServerFn tenant lookup warning:", err);
  }

  return null;
}

export const BRAND_COLOR_EVENT = "capoasis_brand_color_change";

/**
 * Synchronously determine active brand color from tenant cache or company cache.
 */
export function getActiveBrandColor(): string {
  if (typeof window === "undefined") return DEFAULT_BRAND_COLOR;
  const tenant = getTenantFromHost();
  if (tenant) {
    const cached = getCachedTenantBranding(tenant);
    if (cached?.brandColor) return cached.brandColor;
  }
  try {
    const raw = localStorage.getItem("company_branding");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.brandColor) return parsed.brandColor;
    }
  } catch (e) {}
  return DEFAULT_BRAND_COLOR;
}

/**
 * Apply company brand color to CSS custom variables in the document root and notify listeners.
 */
export function applyBrandThemeCss(hexColor: string) {
  if (typeof document === "undefined") return;
  const color = hexColor?.trim() || DEFAULT_BRAND_COLOR;

  const root = document.documentElement;
  root.style.setProperty("--brand-primary", color);
  root.style.setProperty("--brand-primary-lighter", `${color}1A`); // 10% opacity in hex
  root.style.setProperty("--brand-primary-border", `${color}40`);  // 25% opacity

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BRAND_COLOR_EVENT, { detail: { brandColor: color } }));
  }
}

/**
 * Generate a letter-based SVG favicon data URI (e.g. "S" for Salado).
 */
export function generateLetterFaviconSvg(
  letter: string,
  brandColor?: string,
): string {
  const char = (letter || "C").trim().charAt(0).toUpperCase();
  const bg = brandColor?.trim() || "#18181B";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <rect width="64" height="64" rx="14" fill="${bg}"/>
    <text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${char}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Dynamically updates document.title and <link rel="icon"> / <link rel="apple-touch-icon"> in the DOM.
 * - If custom faviconUrl is provided, uses that.
 * - If not provided for a company, generates a letter-based favicon (e.g. "S" for Salado).
 * - For unbranded / root domain: title is "CapOasis Intranet", favicon is "/capoasis_favicon.png".
 */
export function applyBrowserWhiteLabel(
  brand?: {
    shortName?: string | null;
    name?: string | null;
    faviconUrl?: string | null;
    brandColor?: string | null;
  } | null,
) {
  if (typeof document === "undefined") return;

  const defaultTitle = "CapOasis Intranet";
  const defaultFavicon = "/capoasis_favicon.png";

  const rawShortName = (brand?.shortName || brand?.name || "").trim();
  const isCustomCompany =
    rawShortName.length > 0 && rawShortName.toLowerCase() !== "capoasis";

  const title = isCustomCompany ? `${rawShortName} Intranet` : defaultTitle;
  
  let favicon: string;
  if (brand?.faviconUrl?.trim()) {
    favicon = brand.faviconUrl.trim();
  } else if (isCustomCompany) {
    favicon = generateLetterFaviconSvg(rawShortName, brand?.brandColor || undefined);
  } else {
    favicon = defaultFavicon;
  }

  // Update title
  document.title = title;

  // Update or create favicon link
  let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.getElementsByTagName("head")[0]?.appendChild(link);
  }
  link.href = favicon;
  if (favicon.startsWith("data:image/svg+xml") || favicon.endsWith(".svg")) {
    link.type = "image/svg+xml";
  } else if (favicon.endsWith(".webp")) {
    link.type = "image/webp";
  } else if (favicon.endsWith(".ico")) {
    link.type = "image/x-icon";
  } else {
    link.type = "image/png";
  }

  let shortcutLink: HTMLLinkElement | null = document.querySelector("link[rel='shortcut icon']");
  if (shortcutLink) {
    shortcutLink.href = favicon;
  }

  let appleLink: HTMLLinkElement | null = document.querySelector("link[rel='apple-touch-icon']");
  if (appleLink) {
    appleLink.href = favicon;
  }
}

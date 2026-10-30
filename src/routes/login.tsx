import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye as Visibility, EyeOff as VisibilityOff, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { isMasterAdmin } from "../lib/master";
import { getBrandConfig } from "../lib/brand-config";
import {
  getTenantFromHost,
  extractTenantSlugFromHostStr,
  getCachedTenantBranding,
  fetchTenantBrandingServerFn,
  applyBrandThemeCss,
  applyBrowserWhiteLabel,
  generateLetterFaviconSvg,
  DEFAULT_BRAND_COLOR,
  type TenantBranding,
} from "../lib/tenant-brand";

export const Route = createFileRoute("/login")({
  loader: async () => {
    let slug: string | null = null;

    if (typeof window === "undefined") {
      try {
        const { getRequestHost } = await import("@tanstack/start-server-core");
        const host = getRequestHost({ xForwardedHost: true });
        slug = extractTenantSlugFromHostStr(host);
      } catch {
        // Not running in an SSR server context, ignore.
      }
    } else {
      slug = getTenantFromHost();
    }

    if (slug) {
      const b = await fetchTenantBrandingServerFn({ data: slug });
      return { branding: b };
    }
    return { branding: null };
  },
  head: ({ loaderData }) => {
    const brand = getBrandConfig();
    const tenantBrand = loaderData?.branding;
    const rawShortName = (tenantBrand?.shortName || tenantBrand?.name || "").trim();
    const isCustomCompany = rawShortName.length > 0 && rawShortName.toLowerCase() !== "teamstuff";
    const title = isCustomCompany ? `${rawShortName} HRMS` : brand.appName;
    const favicon = tenantBrand?.faviconUrl?.trim()
      ? tenantBrand.faviconUrl.trim()
      : isCustomCompany
      ? generateLetterFaviconSvg(rawShortName, tenantBrand?.brandColor || undefined)
      : brand.favicon;

    return {
      title,
      meta: [
        {
          name: "description",
          content: `Access your ${tenantBrand?.name || brand.appName} HRMS portal.`,
        },
      ],
      links: [
        { rel: "icon", href: favicon },
        { rel: "shortcut icon", href: favicon },
        { rel: "apple-touch-icon", href: favicon },
      ],
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const [loading, setLoading] = useState(false);

  const [branding, setBranding] = useState<TenantBranding | null>(() => {
    if (loaderData?.branding) return loaderData.branding;
    if (typeof window !== "undefined") {
      const t = getTenantFromHost();
      if (t) return getCachedTenantBranding(t);
    }
    return null;
  });

  const activeTenant = typeof window !== "undefined" ? getTenantFromHost() : null;
  // Only display custom tenant branding if an active tenant domain/subdomain is detected
  const isTenantCustom = Boolean(activeTenant && branding);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate({ to: "/dashboard" });
      }
    });
  }, [navigate]);

  React.useEffect(() => {
    if (isTenantCustom && branding) {
      applyBrandThemeCss(branding.brandColor);
      applyBrowserWhiteLabel(branding);
    } else {
      applyBrandThemeCss(DEFAULT_BRAND_COLOR);
      applyBrowserWhiteLabel(null);
    }
  }, [branding, isTenantCustom]);

  React.useEffect(() => {
    const banner = sessionStorage.getItem("login_banner");
    if (banner) {
      setToast({ open: true, message: banner, severity: "error" });
      sessionStorage.removeItem("login_banner");
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const handleLogin = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setToast({ open: true, message: "Please fill in all credentials.", severity: "error" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { success: isMaster } = await isMasterAdmin({ data: { userId: user.id } });
        if (!isMaster) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.company_id) {
            const { data: company } = await supabase
              .from("companies")
              .select("status")
              .eq("id", profile.company_id)
              .maybeSingle();
            if (company && company.status !== "active") {
              await supabase.auth.signOut();
              throw new Error(
                "Your company has been suspended. Contact your platform administrator.",
              );
            }
          }
        }
      }

      setToast({ open: true, message: "Welcome back!", severity: "success" });
      setTimeout(() => navigate({ to: "/dashboard" }), 350);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Failed to log in.", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin(e);
    }
  };

  const brandName = isTenantCustom
    ? (branding?.shortName || branding?.name || activeTenant?.toUpperCase())
    : "Teamstuff";
  const heroImage = (isTenantCustom && branding?.loginHeroUrl)
    ? branding.loginHeroUrl
    : "/login_hero_minimal.jpg";

  return (
    <div className="login-page-container">
      {/* Left Column: Spacious Form Area */}
      <div className="login-form-side">
        <div className="login-form-inner">
          {/* Header */}
          <div className="login-brand-header">
            {isTenantCustom && branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={brandName}
                className="login-logo-img"
              />
            ) : (
              <h1 className="login-brand-title">
                {brandName}
              </h1>
            )}
            {isTenantCustom && branding?.brandTagline && (
              <p className="login-brand-tagline">
                {branding.brandTagline}
              </p>
            )}
          </div>

          {/* Form Fields */}
          <form onSubmit={handleLogin} onKeyDown={handleKeyDown} className="login-form">
            <div className="login-field-group">
              <label className="login-field-label">
                Work Email
              </label>
              <div className="login-input-wrapper">
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="login-input"
                />
              </div>
            </div>

            <div className="login-field-group">
              <label className="login-field-label">
                Password
              </label>
              <div className="login-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="login-password-toggle"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <VisibilityOff size={18} /> : <Visibility size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="login-submit-btn"
              style={
                isTenantCustom && branding?.brandColor && branding.brandColor !== "#18181b" && branding.brandColor !== "#059669"
                  ? { backgroundColor: branding.brandColor, boxShadow: `0 4px 14px ${branding.brandColor}40` }
                  : undefined
              }
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Hero Image Banner */}
      <div
        className="login-hero-side"
        style={{
          backgroundImage: `url("${heroImage}")`,
        }}
      />

      {/* Toast */}
      {toast.open && (
        <div className={`login-toast-banner ${toast.severity === "error" ? "login-toast-error" : "login-toast-success"}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast((prev) => ({ ...prev, open: false }))}
            className="login-toast-close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

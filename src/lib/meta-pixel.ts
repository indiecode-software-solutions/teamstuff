/**
 * Meta Pixel (Facebook Pixel) client-side tracking utilities.
 *
 * Events tracked across the lead-to-trial funnel:
 *   1. PageView             (Standard — initial load + SPA route changes)
 *   2. StartTrialClick      (Custom — landing page trial CTAs)
 *   3. PricingClick         (Custom — landing page Pricing links)
 *   4. FormStart            (Custom — first interaction with /pricing trial form)
 *   5. CompleteRegistration (Standard — trial registration form submission success)
 *   6. TrialActivated       (Custom — newly provisioned trial workspace entered/activated)
 *
 * Set `VITE_META_PIXEL_ID` in `.env` (and deployment environment variables) to
 * automatically load the Meta Pixel base script in `<head>`.
 */

export type MetaEventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

export function getMetaPixelId(): string {
  const id = (import.meta.env.VITE_META_PIXEL_ID as string | undefined) || "";
  return id.trim();
}

export function buildMetaPixelHeadScript(pixelId: string): string {
  const safeId = pixelId.replace(/[^0-9A-Za-z_-]/g, "");
  if (!safeId) return "";
  return `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${safeId}');
fbq('track', 'PageView');`;
}

function dispatchMetaEvent(
  command: "track" | "trackCustom",
  eventName: string,
  params?: MetaEventParams
) {
  if (typeof window === "undefined") return;

  try {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          cleanParams[k] = v;
        }
      }
    }

    if (typeof window.fbq === "function") {
      if (Object.keys(cleanParams).length > 0) {
        window.fbq(command, eventName, cleanParams);
      } else {
        window.fbq(command, eventName);
      }
    } else if (import.meta.env.DEV) {
      console.debug(`[MetaPixel] ${command}:${eventName}`, cleanParams);
    }
  } catch {
    // Analytics must never interrupt user flows
  }
}

/** 1. Standard Meta Event: PageView */
export function trackPageView() {
  dispatchMetaEvent("track", "PageView");
}

/** 2. Custom Event: StartTrialClick */
export function trackStartTrialClick(params?: {
  location?: "hero" | "bottom_cta" | string;
  destination?: string;
}) {
  dispatchMetaEvent("trackCustom", "StartTrialClick", {
    source: "landing_page",
    destination: "/pricing#trial-form",
    ...params,
  });
}

/** 3. Custom Event: PricingClick */
export function trackPricingClick(params?: {
  location?: "header" | "footer" | string;
  destination?: string;
}) {
  dispatchMetaEvent("trackCustom", "PricingClick", {
    source: "landing_page",
    destination: "/pricing",
    ...params,
  });
}

/** 4. Custom Event: FormStart */
export function trackFormStart(params?: {
  form_name?: string;
  first_field?: string;
}) {
  dispatchMetaEvent("trackCustom", "FormStart", {
    form_name: "trial_registration",
    page: "/pricing",
    ...params,
  });
}

/** 5. Standard Meta Event: CompleteRegistration */
export function trackCompleteRegistration(params?: {
  seats?: number;
  company_name?: string;
  estimated_monthly_value?: number;
}) {
  dispatchMetaEvent("track", "CompleteRegistration", {
    content_name: "14-Day Free Trial",
    currency: "INR",
    value: 0,
    status: true,
    ...params,
  });
}

const PENDING_TRIAL_ACTIVATION_KEY = "indiecode_pending_trial_activation";
const ACTIVATED_TRIAL_PREFIX = "indiecode_trial_activated_";

export function markPendingTrialActivation(companyId: string, seats?: number) {
  if (typeof window === "undefined" || !companyId) return;
  try {
    localStorage.setItem(
      PENDING_TRIAL_ACTIVATION_KEY,
      JSON.stringify({ companyId, seats, ts: Date.now() })
    );
  } catch {}
}

/** 6. Custom Event: TrialActivated (deduplicated per companyId) */
export function trackTrialActivated(params: {
  companyId?: string;
  seats?: number;
  method?: "instant_enter" | "first_login";
}) {
  if (typeof window === "undefined") return;

  const dedupKey = params.companyId ? `${ACTIVATED_TRIAL_PREFIX}${params.companyId}` : null;
  try {
    if (dedupKey && localStorage.getItem(dedupKey)) {
      return;
    }
    if (dedupKey) {
      localStorage.setItem(dedupKey, String(Date.now()));
    }
    localStorage.removeItem(PENDING_TRIAL_ACTIVATION_KEY);
  } catch {}

  dispatchMetaEvent("trackCustom", "TrialActivated", {
    content_name: "14-Day Free Trial",
    company_id: params.companyId,
    seats: params.seats,
    activation_method: params.method || "instant_enter",
  });
}

/**
 * Fires TrialActivated once when a newly registered user signs in via /login
 * and lands on /dashboard for the first time.
 */
export function flushPendingTrialActivation(activeCompanyId?: string | null) {
  if (typeof window === "undefined" || !activeCompanyId) return;
  try {
    const raw = localStorage.getItem(PENDING_TRIAL_ACTIVATION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { companyId?: string; seats?: number };
    if (parsed?.companyId && parsed.companyId === activeCompanyId) {
      trackTrialActivated({
        companyId: parsed.companyId,
        seats: parsed.seats,
        method: "first_login",
      });
    }
  } catch {}
}

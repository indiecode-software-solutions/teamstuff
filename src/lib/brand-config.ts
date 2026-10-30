export type BrandMode = "teamstuff" | "capoasis";

export interface BrandConfig {
  brand: BrandMode;
  appName: string;
  shortName: string;
  tagline: string;
  companyName: string;
  favicon: string;
  appleTouchIcon: string;
  logo: string;
  logoIcon: string;
  showMarketingLanding: boolean;
  showPricing: boolean;
  metaDescription: string;
}

const NEUTRAL_FAVICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#18181B"/><text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="34" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">C</text></svg>'
  );

export function getBrandConfig(): BrandConfig {
  return {
    brand: "capoasis",
    appName: "CapOasis Intranet",
    shortName: "CapOasis",
    tagline: "Corporate Internal Operations & Intranet Portal",
    companyName: "CapOasis",
    favicon: NEUTRAL_FAVICON,
    appleTouchIcon: NEUTRAL_FAVICON,
    logo: "/teamstuff_logo.png",
    logoIcon: NEUTRAL_FAVICON,
    showMarketingLanding: true,
    showPricing: true,
    metaDescription: "CapOasis Corporate internal hub for team operations, attendance, tasks, and resources.",
  };
}


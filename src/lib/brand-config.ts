export type BrandMode = "capoasis";

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

export function getBrandConfig(): BrandConfig {
  return {
    brand: "capoasis",
    appName: "CapOasis Intranet",
    shortName: "CapOasis",
    tagline: "Corporate Internal Operations & Intranet Portal",
    companyName: "CapOasis",
    favicon: "/capoasis_favicon.png",
    appleTouchIcon: "/capoasis_favicon.png",
    logo: "/capoasis_intranet.png",
    logoIcon: "/capoasis_favicon.png",
    showMarketingLanding: true,
    showPricing: true,
    metaDescription: "CapOasis Intranet — secure internal hub for team operations, attendance, tasks, and resources.",
  };
}


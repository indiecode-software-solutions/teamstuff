export type BrandMode = "teamstuff";

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
    brand: "teamstuff",
    appName: "Teamstuff",
    shortName: "Teamstuff",
    tagline: "Corporate Internal Operations & HRMS Portal",
    companyName: "Teamstuff",
    favicon: "/teamstuff_icon_logo.png",
    appleTouchIcon: "/teamstuff_icon_logo.png",
    logo: "/teamstuff_logo.png",
    logoIcon: "/teamstuff_icon_logo.png",
    showMarketingLanding: true,
    showPricing: true,
    metaDescription: "Teamstuff — secure internal hub for team operations, attendance, tasks, and resources.",
  };
}


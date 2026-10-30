export type BrandMode = "indiecode" | "teamstuff";

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
    brand: "indiecode",
    appName: "Indiecode HRMS",
    shortName: "Indiecode",
    tagline: "Corporate Operations & HRMS Platform by Indiecode",
    companyName: "Indiecode Software Solutions",
    favicon: "/favicon.ico",
    appleTouchIcon: "/favicon.png",
    logo: "",
    logoIcon: "",
    showMarketingLanding: true,
    showPricing: true,
    metaDescription: "Indiecode HRMS — secure unified workspace for corporate operations, attendance, payroll, and teams.",
  };
}


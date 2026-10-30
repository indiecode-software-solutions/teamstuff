import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.corporate.intranet",
  appName: "indiecode HRMS",
  webDir: "dist",
  server: {
    // Point the Android WebView to the live Cloudflare Workers deployment.
    // This means all server functions, SSR, and APIs work correctly.
    url: "https://pranav-patil-13-corporate-intranet.indiecode-in.workers.dev",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#111111",
  },
};

export default config;

import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  // Native SDKs can initialize during bridge startup. Leave advertising plugins
  // out of unconfigured prototypes rather than relying on a later JS switch.
  includePlugins: [
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/geolocation",
    "@capacitor/push-notifications",
    "@capacitor/share",
    ...(process.env.BLUEBIRD_MOBILE_NATIVE_ADS_READY === "true"
      ? ["@capacitor-community/facebook-login", "@capacitor-firebase/analytics"]
      : []),
  ],
  appId: "com.onbluebird.marketplace",
  appName: "Bluebird",
  appendUserAgent: "Bluebird (https://onbluebird.com)",
  webDir: "dist",
  // Production always packages local assets. Never use server.url/live reload in release builds.
  server: { androidScheme: "https" },
  ios: { contentInset: "automatic" },
  plugins: {
    // Use native insets plus the standard CSS env() values. This avoids a
    // document-start CSS injection race on Android's initial blank page.
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover" },
    PushNotifications: { presentationOptions: ["badge", "sound", "banner", "list"] },
  },
};
export default config;

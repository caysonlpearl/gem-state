import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  // Native SDKs can initialize during bridge startup. Leave advertising plugins
  // out of unconfigured prototypes rather than relying on a later JS switch.
  includePlugins: [
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/push-notifications",
    "@capacitor/share",
    ...(process.env.BLUEBIRD_MOBILE_NATIVE_ADS_READY === "true"
      ? ["@capacitor-community/facebook-login", "@capacitor-firebase/analytics"]
      : []),
  ],
  appId: "com.onbluebird.marketplace",
  appName: "Bluebird",
  webDir: "dist",
  // Production always packages local assets. Never use server.url/live reload in release builds.
  server: { androidScheme: "https" },
  ios: { contentInset: "automatic" },
  plugins: { PushNotifications: { presentationOptions: ["badge", "sound", "banner", "list"] } },
};
export default config;

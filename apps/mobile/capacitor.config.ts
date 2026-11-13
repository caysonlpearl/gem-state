import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.onbluebird.marketplace",
  appName: "Bluebird",
  webDir: "dist",
  // Production always packages local assets. Never use server.url/live reload in release builds.
  server: { androidScheme: "https" },
  ios: { contentInset: "automatic" },
  plugins: { PushNotifications: { presentationOptions: ["badge", "sound", "banner", "list"] } },
};
export default config;

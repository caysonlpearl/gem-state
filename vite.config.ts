import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Keep the protection boundary used by the standalone server-function
      // setup. Some server functions intentionally perform a dynamic import
      // of a .server module inside their server-only handler.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts, which
      // contains the SSR error wrapper and Stripe webhook handling.
      server: { entry: "server" },
    }),
    react(),
    nitro({
      preset: process.env["NITRO_PRESET"] ?? "cloudflare-module",
      cloudflare: { deployConfig: false, nodeCompat: true },
    }),
  ],
  resolve: { tsconfigPaths: true },
});

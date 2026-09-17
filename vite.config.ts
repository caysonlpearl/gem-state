import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
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
  },
  nitro: true,
});

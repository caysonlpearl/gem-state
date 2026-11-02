import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    {
      name: "photon-compiled-wasm-module",
      enforce: "pre",
      resolveId(source) {
        // Keep this module import for Nitro's unwasm pass. Vite's initial
        // server pass cannot parse the binary or instantiate wasm-bindgen.
        if (source === "@cf-wasm/photon/photon.wasm?module")
          return {
            id: `${fileURLToPath(new URL("./node_modules/@cf-wasm/photon/dist/lib/photon_rs_bg.wasm", import.meta.url))}?module`,
            external: true,
          };
        return null;
      },
    },
  ],
  tanstackStart: {
    router: {
      codeSplittingOptions: {
        defaultBehavior: [
          ["loader"],
          ["component"],
          ["pendingComponent"],
          ["errorComponent"],
          ["notFoundComponent"],
        ],
      },
    },
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

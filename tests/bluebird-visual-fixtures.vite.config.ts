import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const testRoot = dirname(fileURLToPath(import.meta.url));
const inertControls = resolve(testRoot, "bluebird-visual-fixture-stubs.tsx");

/** Local-only harness config: excludes TanStack Start's production route fallback. */
export default defineConfig({
  root: testRoot,
  publicDir: resolve(testRoot, "../public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@tanstack/react-router",
        replacement: inertControls,
      },
      {
        find: "@/components/community/PartnerJobHeartButton",
        replacement: inertControls,
      },
      {
        find: "@/components/community/PartnerHomeHeartButton",
        replacement: inertControls,
      },
      {
        find: "@/components/community/PartnerVehicleHeartButton",
        replacement: inertControls,
      },
      {
        find: "@/components/community/WatchHeartButton",
        replacement: inertControls,
      },
      { find: "@", replacement: resolve(testRoot, "../src") },
    ],
  },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "@phosphor-icons/react"],
  },
});

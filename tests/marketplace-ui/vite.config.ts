import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: repo + "public",
  envDir: "/tmp/bluebird-no-environment",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": repo + "src" }, dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4190, strictPort: true, fs: { allow: [repo] } },
});

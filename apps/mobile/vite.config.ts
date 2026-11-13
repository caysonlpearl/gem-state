import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    mode === "production" &&
    env.VITE_MOBILE_API_ORIGIN &&
    new URL(env.VITE_MOBILE_API_ORIGIN).origin !== "https://onbluebird.com"
  )
    throw Error("Release apps must use the canonical HTTPS Bluebird API.");
  return {
    plugins: [react(), tailwindcss()],
    publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
    server: {
      watch: { ignored: ["**/android/**", "**/ios/**"] },
      fs: {
        allow: [
          fileURLToPath(new URL(".", import.meta.url)),
          fileURLToPath(new URL("../../src", import.meta.url)),
          fileURLToPath(new URL("../../public", import.meta.url)),
          fileURLToPath(new URL("../../node_modules", import.meta.url)),
        ],
      },
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
      dedupe: ["react", "react-dom"],
    },
    build: { sourcemap: false },
  };
});

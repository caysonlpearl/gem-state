import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, "../..");
const boundary = resolve(root, "boundaries.ts");
const inertHearts = resolve(root, "../bluebird-visual-fixture-stubs.tsx");
const homeQueryId = "\0offline-production-home-query.ts";
const canonicalId = "\0offline-production-canonical.tsx";

export default defineConfig({
  root,
  cacheDir: resolve(repo, ".output/homepage-ui-vite-cache"),
  envDir: resolve(root, "no-environment-files"),
  publicDir: resolve(repo, "public"),
  plugins: [
    {
      name: "offline-production-boundary",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:production-canonical") return canonicalId;
        if (id === "virtual:production-home-query") return homeQueryId;
        return null;
      },
      load(id) {
        if (id === homeQueryId) {
          const source = readFileSync(resolve(repo, "src/lib/classifieds.functions.ts"), "utf8");
          const file = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
          const functions = ["loadClassifiedsHomeCarsTrucks", "loadClassifiedsHomeLead"]
            .map((name) => {
              const fn = file.statements.find(
                (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
              );
              if (!fn) throw new Error(`Production ${name} was not found`);
              return fn
                .getText(file)
                .replace(
                  /const \{ shortCache, PUBLIC_PAGE_CACHE_MS \} = await import\("\.\/short-cache.server"\);/g,
                  "",
                );
            })
            .join("\n");
          return ts.transpileModule(
            `import { listingCardSummary } from "@/lib/listing-card-summary";
            export function productionHomeLead(deps) {
            const { shortCache, PUBLIC_PAGE_CACHE_MS, runBrowseClassifieds, loadClassifiedsHomeCategoryData } = deps;
            ${functions}
            return loadClassifiedsHomeLead();
          }`,
            { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
          ).outputText;
        }
        if (id === canonicalId) {
          // Mount the actual production component without mounting the networked app shell.
          const source = readFileSync(resolve(repo, "src/routes/__root.tsx"), "utf8");
          const file = ts.createSourceFile(
            "root.tsx",
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
          );
          const component = file.statements.find(
            (node) => ts.isFunctionDeclaration(node) && node.name?.text === "CanonicalTags",
          );
          if (!component) throw new Error("Production CanonicalTags component was not found");
          const moduleSource = `import { useRouterState } from '@tanstack/react-router';
            import { brand } from '@/config/brand';
            import { canonicalPagePath, isPrivateSeoPath } from '@/lib/seo-policy';
            export ${component.getText(file)}`;
          return ts.transpileModule(moduleSource, {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.ReactJSX,
            },
          }).outputText;
        }
        if (
          id.startsWith(resolve(repo, "src")) &&
          (/\.server\./.test(id) || /integrations\/supabase|\.functions\./.test(id))
        ) {
          throw new Error(`Offline harness refused an unstubbed backend import: ${id}`);
        }
        return null;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      ...[
        "@tanstack/react-start",
        "@/lib/classifieds.functions",
        "@/lib/analytics",
        "@/lib/service-directory.functions",
        "@/lib/account-center.functions",
        "@/hooks/useAuth",
        "@/lib/account.functions",
        "@/lib/conversation.functions",
        "@/lib/notifications.functions",
        "@/integrations/supabase/lazy-client",
        "@/components/layout/NotificationBell",
      ].map((find) => ({
        find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        replacement: boundary,
      })),
      ...[
        "PartnerJobHeartButton",
        "PartnerHomeHeartButton",
        "PartnerVehicleHeartButton",
        "WatchHeartButton",
      ].map((name) => ({ find: `@/components/community/${name}`, replacement: inertHearts })),
      { find: "@", replacement: resolve(repo, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4179,
    strictPort: true,
    hmr: false,
    fs: { allow: [repo, realpathSync(resolve(repo, "node_modules"))] },
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'none'; form-action 'self'; base-uri 'self'",
    },
  },
});


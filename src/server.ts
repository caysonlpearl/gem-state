import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { registerRuntimeBindings } from "./lib/runtime-env.server";
import { handleStripeWebhook } from "./lib/stripe-marketplace.server";
import { seoHostPolicy } from "./lib/seo-policy";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Pages are fully server-rendered, so the ~50 module preloads only need to
// arrive in time to make the page interactive. At their default high
// priority they compete with the CSS and fonts the first paint needs, which
// on slow phones delays it by about a second. Marking them low priority lets
// the page paint first and hydrate right after.
const MODULE_PRELOAD = '<link rel="modulepreload"';
const MODULE_PRELOAD_LOW = '<link rel="modulepreload" fetchpriority="low"';

function lowerModulePreloadPriority(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.includes("text/html")) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // A tag can be split across chunks; hold back a tail shorter than the
  // pattern so it is matched once the next chunk arrives.
  let carry = "";
  const keep = MODULE_PRELOAD.length - 1;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = (carry + decoder.decode(chunk, { stream: true })).replaceAll(
          MODULE_PRELOAD,
          MODULE_PRELOAD_LOW,
        );
        carry = text.slice(-keep);
        controller.enqueue(encoder.encode(text.slice(0, -keep)));
      },
      flush(controller) {
        const text = (carry + decoder.decode()).replaceAll(MODULE_PRELOAD, MODULE_PRELOAD_LOW);
        controller.enqueue(encoder.encode(text));
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      registerRuntimeBindings(env);
      const url = new URL(request.url);
      const hostPolicy = seoHostPolicy(url);
      if (hostPolicy.redirect && ["GET", "HEAD"].includes(request.method)) {
        return Response.redirect(hostPolicy.redirect, 301);
      }
      if (url.pathname === "/api/stripe/webhook") {
        if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
        return await handleStripeWebhook(request, env);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = lowerModulePreloadPriority(
        await normalizeCatastrophicSsrResponse(response),
      );
      if (hostPolicy.preview) normalized.headers.set("X-Robots-Tag", "noindex, nofollow");
      return normalized;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
  async scheduled(controller: unknown, env: unknown, ctx: unknown) {
    registerRuntimeBindings(env);
    const task = Promise.all([
      import("./lib/saved-search-worker.server").then(({ processSavedSearchAlerts }) =>
        processSavedSearchAlerts(),
      ),
      import("./lib/dealer-inventory.functions").then(
        ({ processScheduledDealerInventorySources }) => processScheduledDealerInventorySources(),
      ),

      ...(typeof controller === "object" &&
      controller !== null &&
      (controller as { cron?: string }).cron === "0 16 * * 4"
        ? [
            import("./lib/openwebninja-listings.server").then(({ refreshOpenWebNinjaSearches }) =>
              refreshOpenWebNinjaSearches(),
            ),
          ]
        : []),
    ]);
    const runtime = ctx as { waitUntil?: (promise: Promise<unknown>) => void };
    if (typeof runtime.waitUntil === "function") runtime.waitUntil(task);
    else await task;
  },
};

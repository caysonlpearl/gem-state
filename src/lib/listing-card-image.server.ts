/** A bounded public JPEG cache, not an arbitrary URL proxy. No caller headers are forwarded. */
const PREFIX = "/api/listing-card-image/";
const MAX_BYTES = 512 * 1024;
const MAX_AGE = 86_400;
type ImageCache = Pick<Cache, "match" | "put">;
type Options = {
  cache?: ImageCache;
  fetch?: typeof fetch;
  waitUntil?: (work: Promise<unknown>) => void;
};

/** Edge-cache support varies in private previews; it must not hold a photo indefinitely. */
async function boundedCache<T>(work: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<undefined>((resolve) => {
        timer = globalThis.setTimeout(() => resolve(undefined), 150);
      }),
    ]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}

function failed(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function serveListingCardImage(
  request: Request,
  options: Options = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return failed(404);
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  const file = url.pathname.slice(PREFIX.length);
  if (url.search || !/^[A-Za-z0-9_]{1,160}_600x450\.jpg$/.test(file)) return failed(404);

  const cache =
    options.cache ??
    (globalThis.caches as (CacheStorage & { default?: ImageCache }) | undefined)?.default;
  // Build a clean key without authorization, cookies or incoming request headers.
  const key = new Request(url.origin + PREFIX + file);
  try {
    const hit = cache ? await boundedCache(cache.match(key)) : undefined;
    if (
      hit?.status === 200 &&
      hit.headers.get("Content-Type") === "image/jpeg" &&
      hit.headers.get("X-Bluebird-Image-Cache") === "miss"
    ) {
      const headers = new Headers(hit.headers);
      headers.set("X-Bluebird-Image-Cache", "hit");
      return new Response(request.method === "HEAD" ? null : hit.body, {
        status: hit.status,
        headers,
      });
    }
  } catch {
    /* Private preview environments may not support the edge cache. */
  }

  try {
    const upstream = await (options.fetch ?? globalThis.fetch)(
      `https://images.craigslist.org/${file}`,
      {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        headers: { Accept: "image/jpeg" },
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return failed(upstream.status === 404 ? 404 : 502);
    }
    const type = upstream.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
    const length = Number(upstream.headers.get("Content-Length") ?? 0);
    if (type !== "image/jpeg" || length > MAX_BYTES || !upstream.body) {
      await upstream.body?.cancel();
      return failed(502);
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return failed(502);
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (bytes < 3 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) return failed(502);
    const response = new Response(body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes),
        "Cache-Control": `public, max-age=${MAX_AGE}, s-maxage=${MAX_AGE}`,
        "X-Content-Type-Options": "nosniff",
        "X-Bluebird-Image-Cache": cache ? "miss" : "unavailable",
      },
    });
    if (cache) {
      const save = cache.put(key, response.clone()).catch(() => {});
      if (options.waitUntil) options.waitUntil(save);
      else await boundedCache(save);
    }
    return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
  } catch {
    // The card can fall back to its original public source; never proxy an error page.
    return failed(502);
  }
}

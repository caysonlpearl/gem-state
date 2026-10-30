import type { ClassifiedDetail } from "./classifieds.functions";

export const merchandiseImagePath = (id: string, index = 0) =>
  `/api/public/retailer-image/${id}/${index}`;

/** Only photos belonging to an active, unreported pinned-merchant product. */
export async function serveMerchandiseImage(
  id: string,
  index: string,
  readDetail: (id: string) => Promise<ClassifiedDetail | null>,
  fetchImage: typeof fetch = fetch,
): Promise<Response> {
  if (!/^avantlink-\d{1,20}$/.test(id) || !/^[0-2]$/.test(index)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const detail = await readDetail(id);
    const image = detail?.images[Number(index)];
    if (!image) return new Response("Not found", { status: 404 });
    const url = new URL(image.url);
    if (
      url.protocol !== "https:" || url.hostname !== "images.guns.com" ||
      url.port || url.username || url.password || !url.pathname.startsWith("/prod/")
    ) return new Response("Not found", { status: 404 });
    const upstream = await fetchImage(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "image/jpeg,image/png,image/webp,image/avif,image/gif" },
    });
    const type = upstream.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!upstream.ok || !upstream.body ||
      !["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(type)) {
      return new Response("Photo unavailable", { status: 502 });
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        return new Response("Photo unavailable", { status: 502 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 502 });
  }
}
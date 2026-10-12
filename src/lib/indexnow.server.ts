import { brand } from "@/config/brand";

// IndexNow tells Bing (and the other engines that share its feed) about a
// changed URL right away instead of waiting for a crawl. The key is public by
// design: the same value is served at /<key>.txt to prove we own the domain.
const INDEXNOW_KEY = "22a21ae5cc7ed44e34571eb83453f58f";

/** Fire-and-forget; a failed ping never blocks the action that caused it. */
export async function pingIndexNow(paths: string[]) {
  if (process.env["NODE_ENV"] !== "production" || paths.length === 0) return;
  const host = new URL(brand.urls.siteUrl).host;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${brand.urls.siteUrl}/${INDEXNOW_KEY}.txt`,
        urlList: paths.map((path) => `${brand.urls.siteUrl}${path}`),
      }),
    });
  } catch (error) {
    console.warn("IndexNow ping skipped", error);
  }
}

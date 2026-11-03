import { checkHomepagePhoto } from "./homepage-photo-selection.server.ts";

/** Header-only checks reuse the existing image-host allowlist and cache.
 * Only a confirmed 404/410 permits moving to another saved gallery image.
 * Unknown results (including 403, redirects and timeouts) stop selection. */
export async function selectPartnerSharePhoto(
  images: string[],
  probe: (url: string) => Promise<"available" | "missing" | "unknown"> = checkHomepagePhoto,
): Promise<string | undefined> {
  const candidates = [...new Set(images)].slice(0, 4);
  const lead = candidates[0];
  if (!lead) return undefined;
  try {
    if ((await probe(lead)) !== "missing") return lead;
    for (const candidate of candidates.slice(1)) {
      const status = await probe(candidate);
      if (status === "available") return candidate;
      if (status !== "missing") return lead;
    }
  } catch {
    // Photo verification must not turn a source outage into a missing listing.
  }
  return lead;
}

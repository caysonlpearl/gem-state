import { api } from "./client";
import { installIdentifier } from "./identity";
import { mobileListingDetail, mobileListingSummary } from "../../../src/lib/mobile-listing-detail";
import { listingPresentation } from "./listing-presentation";
import { detailCard } from "./listing-card-data";
import { mobileListingAllowed, type MobileBrowse } from "../../../src/lib/mobile-contract";
import type { ClassifiedDetail } from "../../../src/lib/classifieds.functions";

export type NativeDetailResult = {
  listing: ClassifiedDetail;
  stats: { views: number; favorites: number } | null;
  canSave: boolean;
  canMessage: boolean;
};
export type NativeBrowseResult = MobileBrowse & { total: number; page: number; pageSize: number };
type Screen = NativeDetailResult | NativeBrowseResult;
type Entry = { at: number; data?: Screen; error?: string };
const entries = new Map<string, Entry>();
let scope = "",
  generation = 0;
export function clearNativeScreenResources() {
  entries.clear();
  scope = "";
  generation++;
}
function context(owner?: string) {
  const installId = installIdentifier(),
    identity = `${owner ?? "guest"}:${installId}`;
  if (identity !== scope) {
    clearNativeScreenResources();
    scope = identity;
  }
  return { identity, actor: { userId: owner ?? null, installId } };
}
function key(kind: "detail" | "browse", value: string, owner?: string) {
  return `${context(owner).identity}:${kind}:${value}`;
}
/** Small, expiring process memory only, isolated by account and resettable
 * installation identity. Never persisted or used as a source of activity. */
export function peekNativeScreen<T extends Screen>(
  kind: "detail" | "browse",
  value: string,
  owner?: string,
): { data?: T; error?: string } | undefined {
  const id = key(kind, value, owner),
    entry = entries.get(id);
  if (!entry) return;
  if (Date.now() - entry.at > (entry.error ? 1500 : 60000)) {
    entries.delete(id);
    return;
  }
  return entry as { data?: T; error?: string };
}
async function read<T extends Screen>(
  kind: "detail" | "browse",
  value: string,
  owner?: string,
  signal?: AbortSignal,
  force = false,
): Promise<T> {
  const id = key(kind, value, owner),
    { actor } = context(owner),
    revision = generation;
  if (signal?.aborted) throw signal.reason;
  const cached = force ? undefined : peekNativeScreen<T>(kind, value, owner);
  if (cached?.error) throw Error(cached.error);
  if (cached?.data) return cached.data;
  try {
    const raw = await api<Screen>(
      kind === "detail" ? `listings/${encodeURIComponent(value)}/detail` : `search?${value}`,
      "GET",
      undefined,
      signal,
      actor,
    );
    let data: Screen;
    if (kind === "detail") {
      const result = raw as NativeDetailResult,
        listing = mobileListingDetail(result.listing);
      if (!listing) throw Error("This listing is unavailable in the app.");
      data = {
        listing,
        stats: result.stats
          ? { views: result.stats.views, favorites: result.stats.favorites }
          : null,
        canSave: !listing.ended && result.canSave === true,
        canMessage: !listing.ended && result.canMessage === true,
      };
    } else {
      const result = raw as NativeBrowseResult;
      if (!Array.isArray(result.items)) throw Error("Listings could not be loaded. Please retry.");
      const items = result.items.filter(mobileListingAllowed).flatMap((card) => {
        const safe = mobileListingSummary(listingPresentation(card));
        return safe
          ? [{ ...detailCard(safe, card.canSave === true), canMessage: card.canMessage === true }]
          : [];
      });
      data = {
        items,
        total: result.total ?? items.length,
        page: result.page ?? 1,
        pageSize: result.pageSize ?? 24,
        nextPage: result.nextPage ?? null,
        incomplete: result.incomplete === true,
        selection: result.selection === true,
      };
    }
    if (signal?.aborted) throw signal.reason;
    if (revision !== generation) throw Error("This page changed while loading. Please try again.");
    entries.delete(id);
    entries.set(id, { at: Date.now(), data });
    while (entries.size > 12) entries.delete(entries.keys().next().value!);
    return data as T;
  } catch (error) {
    if (!signal?.aborted && revision === generation)
      entries.set(id, {
        at: Date.now(),
        error:
          error instanceof Error ? error.message : "This page could not be loaded. Please retry.",
      });
    while (entries.size > 12) entries.delete(entries.keys().next().value!);
    throw error;
  }
}
export const readNativeDetail = (id: string, owner?: string, signal?: AbortSignal, force = false) =>
  read<NativeDetailResult>("detail", id, owner, signal, force);
export const readNativeBrowse = (
  query: string,
  owner?: string,
  signal?: AbortSignal,
  force = false,
) => read<NativeBrowseResult>("browse", query, owner, signal, force);

export async function prepareLeadPhoto(data: NativeDetailResult, signal: AbortSignal) {
  const source = data.listing.images[0]?.url;
  if (!source || signal.aborted) return;
  const image = new Image();
  image.src = source;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => {};
  try {
    await Promise.race([
      image.decode().catch(() => {}),
      new Promise<void>((resolve) => {
        stop = resolve;
        signal.addEventListener("abort", stop, { once: true });
        timer = setTimeout(resolve, 1200);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

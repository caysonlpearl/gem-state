import { canonicalSellerSourceProfile } from "./seller-claims.ts";

/** Ready-to-publish queue helpers. Publishing is one seller at a time because
 * the server binds every selected row to a single seller identity/claim. */
export type QueueItem = {
  id: string;
  sourceProfileUrl: string;
  status: string;
  syncConflict?: string | null;
};

export type SellerQueueGroup = {
  profile: string;
  name: string;
  site: string;
  itemIds: string[];
  newCount: number;
  updateCount: number;
  removedCount: number;
};

export function queueProfileKey(url: string): string {
  try {
    return canonicalSellerSourceProfile(url);
  } catch {
    return url;
  }
}

export function sourceSiteName(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Unknown site";
  }
  if (host.endsWith("facebook.com")) return "Facebook";
  if (host === "classifieds.ksl.com") return "KSL";
  if (host.endsWith("vinted.com")) return "Vinted";
  if (host.endsWith("whatnot.com")) return "Whatnot";
  if (host.endsWith("diesel-depot.com")) return "Diesel Depot";
  return "Unknown site";
}

export function groupQueueBySeller(
  items: QueueItem[],
  names: Record<string, string> = {},
): SellerQueueGroup[] {
  const groups = new Map<string, SellerQueueGroup>();
  for (const item of items) {
    const profile = queueProfileKey(item.sourceProfileUrl);
    let group = groups.get(profile);
    if (!group) {
      group = {
        profile,
        name: names[profile] || names[item.sourceProfileUrl] || profile,
        site: sourceSiteName(profile),
        itemIds: [],
        newCount: 0,
        updateCount: 0,
        removedCount: 0,
      };
      groups.set(profile, group);
    }
    group.itemIds.push(item.id);
    if (item.status === "possibly_removed") group.removedCount++;
    else if (item.status === "needs_update") group.updateCount++;
    else group.newCount++;
  }
  return [...groups.values()];
}

/** Distinct sellers among the selected rows. */
export function selectedProfiles(items: QueueItem[], selectedIds: Set<string>): string[] {
  return [
    ...new Set(
      items.filter((i) => selectedIds.has(i.id)).map((i) => queueProfileKey(i.sourceProfileUrl)),
    ),
  ];
}

/** Why the publish button is disabled, or null when it can run. Order matches
 * what the admin must fix first. */
export function publishBlocker(input: {
  items: QueueItem[];
  selectedIds: Set<string>;
  dirtyIds: Set<string>;
  authorized: boolean;
  linkedNeedsEmail?: boolean;
}): string | null {
  const selected = input.items.filter((i) => input.selectedIds.has(i.id));
  if (!selected.length) return "Select one seller's listings to continue.";
  const sellers = selectedProfiles(input.items, input.selectedIds).length;
  if (sellers > 1)
    return `Selection spans ${sellers} sellers. Choose one seller — listings publish one seller at a time.`;
  const dirty = selected.filter((i) => input.dirtyIds.has(i.id)).length;
  if (dirty) return `Save or revert edits on ${dirty} selected listing(s) first.`;
  if (selected.some((item) => item.syncConflict))
    return "Review the Bluebird conflict on the selected listing before applying it.";
  if (input.linkedNeedsEmail) return "Enter the linked seller's email.";
  if (!input.authorized) return "Confirm the seller authorized Bluebird to manage these listings.";
  return null;
}

/** Accurate description of what applying the selection does. */
export function describeAction(items: QueueItem[], selectedIds: Set<string>): string {
  const [group] = groupQueueBySeller(items.filter((i) => selectedIds.has(i.id)));
  if (!group) return "Nothing selected";
  const parts: string[] = [];
  if (group.newCount) parts.push(`publish ${group.newCount} new`);
  if (group.updateCount) parts.push(`update ${group.updateCount} Bluebird listing(s)`);
  if (group.removedCount) parts.push(`take ${group.removedCount} offline`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Reason codes the extension reports for listings it couldn't read. */
export const UNREADABLE_REASON_LABELS: Record<string, string> = {
  page_timeout: "Page didn't finish loading",
  page_not_verified: "Page couldn't be verified as the listing",
  verification_incomplete: "Human verification not completed",
  unsupported_url: "Unsupported listing URL",
  price_or_details_missing: "Price or details missing",
  structured_data_missing:
    "Listing details not found in page data or visible fields; retry after loading",
  structured_data_invalid: "Page listing data could not be parsed; retry after loading",
  read_failed: "Page couldn't be read",
  injection_failed: "Reader couldn't run on the page; retry",
  empty_result: "Page returned no listing data; retry after it loads",
  challenge_detected: "Site check appeared while reading; retry",
  reader_window_failed: "Reader window couldn't open",
  not_reported: "Reason not reported (older extension or past run)",
};

export type UnreadableDiagnostic = { site: string; reason: string; count: number };

/** Merge and sanitize diagnostics; any unread rows not explained are counted
 * as "not_reported" so the UI never invents a cause. */
export function groupUnreadable(diagnostics: unknown, totalUnread: number): UnreadableDiagnostic[] {
  const merged = new Map<string, UnreadableDiagnostic>();
  let explained = 0;
  for (const raw of Array.isArray(diagnostics) ? diagnostics : []) {
    const d = raw as Partial<UnreadableDiagnostic> | null;
    const count = Math.floor(Number(d?.count));
    if (!d || !Number.isFinite(count) || count <= 0) continue;
    const reason = UNREADABLE_REASON_LABELS[String(d.reason)] ? String(d.reason) : "read_failed";
    const site = ["Facebook", "KSL", "Vinted", "Whatnot", "Diesel Depot"].includes(String(d.site))
      ? String(d.site)
      : "Unknown site";
    const take = Math.min(count, Math.max(0, totalUnread - explained));
    if (!take) continue;
    explained += take;
    const key = `${site}|${reason}`;
    const entry = merged.get(key) ?? { site, reason, count: 0 };
    entry.count += take;
    merged.set(key, entry);
  }
  if (totalUnread > explained)
    merged.set("|not_reported", {
      site: "All sites",
      reason: "not_reported",
      count: totalUnread - explained,
    });
  return [...merged.values()].sort((a, b) => b.count - a.count);
}

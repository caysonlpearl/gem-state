import { keepBluebirdImportVersion } from "@/lib/seller-claims.functions";
import {
  ManagedSellerOperations,
  PrepareSellerClaimButton,
  ClaimLinkResult,
} from "@/components/seller/ManagedSellerOperations";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { importedSubcategory, importSubcategoryField } from "@/lib/import-subcategories";
import { fieldsForClassifiedItem } from "@/config/classified-item-fields";
import { classifiedCategories } from "@/config/classifieds";
import { findIdahoPlace } from "@/config/idaho-places";
import { IdahoCityPicker } from "@/components/classifieds/IdahoCityPicker";
import {
  discardAllFacebookImportItems,
  setFacebookImportItemsCategory,
  setFacebookImportItemsCity,
  discardFacebookImportItem,
  getFacebookImportItems,
  getFacebookImportProfiles,
  getFacebookRefreshTargets,
  publishFacebookImportItems,
  stageFacebookImportBatch,
  updateFacebookImportItem,
  type FbImportItem,
  type FbImportItemInput,
} from "@/lib/fb-import.functions";
import bookmarkletSource from "../../../tools/facebook-import-bookmarklet.js?raw";
import { sellerShareUrl } from "@/lib/seller-share";
import {
  UNREADABLE_REASON_LABELS,
  describeAction,
  groupQueueBySeller,
  groupUnreadable,
  publishBlocker,
  queueProfileKey,
  selectedProfiles,
  sourceSiteName,
  type UnreadableDiagnostic,
} from "@/lib/fb-import-queue";

const bookmarkletHref = `javascript:${encodeURIComponent(bookmarkletSource)}`;

export const Route = createFileRoute("/_authenticated/admin/fb-import")({
  head: () => ({
    meta: [
      { title: "Facebook seller import · Gem State Classifieds" },
      {
        name: "description",
        content: "Import a consenting seller's Facebook Marketplace listings onto GemList.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FbImportPage,
});

const conditions = [
  ["new_with_tags", "New"],
  ["new_without_tags", "New, no tags"],
  // Facebook calls this grade "Used - Like New"; it maps to Bluebird's
  // existing used_excellent enum without changing the marketplace-wide
  // condition taxonomy.
  ["used_excellent", "Used — like new"],
  ["used_good", "Used — good"],
  ["not_applicable", "Not applicable"],
] as const;

const statusLabels: Record<string, string> = {
  draft: "New",
  needs_update: "Needs update",
  possibly_removed: "Sold or removed at the source",
};

// React sanitizes any href prop that starts with "javascript:" (replacing it
// with a thrown-error placeholder) as an XSS precaution, so a plain
// `<a href={bookmarkletHref}>` can never work for a bookmarklet. Setting the
// attribute directly on the DOM node bypasses React's prop diffing entirely.
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref);
  }, []);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      draggable
      className="inline-flex h-9 cursor-grab items-center rounded-md border border-input bg-background px-3 text-[12px] font-semibold"
      title="Drag this to your bookmarks bar -- clicking it here won't run it."
    >
      📥 GemList FB Import
    </a>
  );
}

import {
  canonicalImportSource,
  mayInferScanAbsence,
  runImportRows,
  type ScanEvidence,
} from "@/lib/import-refresh";
import { Button } from "@/components/ui/button";

const DAY_MS = 24 * 60 * 60 * 1000;

type ProfileScanReport = {
  sourceProfileUrl: string;
  sellerName?: string;
  scanned: number;
  discovered: number;
  scan: ScanEvidence;
  seenUrls: string[];
  results: FbImportItemInput[];
  unreadableReasons?: unknown;
};

function ImportedSellers() {
  const queryClient = useQueryClient();
  const fetchProfiles = useServerFn(getFacebookImportProfiles);
  const fetchTargets = useServerFn(getFacebookRefreshTargets);
  const stage = useServerFn(stageFacebookImportBatch);
  const { data } = useQuery({
    queryKey: ["fb-import-profiles"],
    queryFn: () => fetchProfiles(),
  });

  const [extensionReady, setExtensionReady] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanReports, setScanReports] = useState<
    Array<{
      profile: string;
      scanned: number;
      discovered: number;
      newCount: number;
      changed: number;
      removed: number;
      unread: number;
      failed: number;
      complete: boolean;
    }>
  >([]);
  const [scanAuthorized, setScanAuthorized] = useState(false);
  const [unreadReport, setUnreadReport] = useState<UnreadableDiagnostic[] | null>(null);

  // The extension's bridge script answers this ping; it's only present on
  // pages opened after the extension was (re)loaded.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string } | null)?.type === "gemlist-ext-pong") {
        const version = String(event.data.version ?? "0")
          .split(".")
          .map(Number);
        setExtensionReady(version[0] > 1 || (version[0] === 1 && version[1] >= 5));
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "gemlist-ext-ping" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const refreshMutation = useMutation({
    mutationFn: async (profileUrl: string | null) => {
      if (!extensionReady)
        throw new Error(
          "Reload Bluebird Listing Import 1.5 or newer in Chrome, then refresh this page.",
        );
      if (!scanAuthorized) throw new Error("Confirm permission to scan these sellers first.");
      const all = await fetchTargets();
      const profiles = (data ?? []).filter((p) => !profileUrl || p.sourceProfileUrl === profileUrl);
      if (!profiles.length) throw new Error("No seller profiles to scan.");
      const requestId = crypto.randomUUID();
      setScanReports([]);
      setProgress({ done: 0, total: profiles.length });
      const reports = await new Promise<ProfileScanReport[]>((resolve, reject) => {
        const received: ProfileScanReport[] = [];
        let timer: ReturnType<typeof setTimeout>;
        const cleanup = () => {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
        };
        const heartbeat = () => {
          clearTimeout(timer);
          timer = setTimeout(
            () => {
              cleanup();
              reject(
                new Error(
                  "No scan progress received. Reload the extension and retry; unread records remain unchanged.",
                ),
              );
            },
            8 * 60 * 1000,
          );
        };
        const onMessage = (event: MessageEvent) => {
          if (
            event.source !== window ||
            event.origin !== window.location.origin ||
            event.data?.requestId !== requestId
          )
            return;
          heartbeat();
          const m = event.data;
          if (m.type === "gemlist-fb-refresh-progress") {
            setProgress({ done: m.done ?? 0, total: m.total ?? profiles.length });
          } else if (m.type === "gemlist-fb-profile-result") {
            received.push(m.report);
          } else if (m.type === "gemlist-fb-refresh-result") {
            cleanup();
            if (m.error && !received.length) reject(new Error(m.error));
            else resolve(received);
          }
        };
        window.addEventListener("message", onMessage);
        heartbeat();
        window.postMessage(
          {
            type: "gemlist-ext-refresh",
            requestId,
            profiles: profiles.map((p) => ({
              sourceProfileUrl: p.sourceProfileUrl,
              targets: all.filter((t) => t.sourceProfileUrl === p.sourceProfileUrl),
            })),
          },
          window.location.origin,
        );
      });
      let checked = 0,
        discovered = 0,
        newCount = 0,
        changed = 0,
        removed = 0,
        unread = 0,
        failed = 0;
      const diagnostics: UnreadableDiagnostic[] = [];
      for (const report of reports) {
        let sellerNew = 0,
          sellerChanged = 0,
          sellerRemoved = 0,
          sellerFailed = 0;
        const unique = new Map(
          report.results.map((item) => [
            canonicalImportSource(report.sourceProfileUrl, item.sourceUrl),
            item,
          ]),
        );
        for (const item of unique.values()) {
          try {
            const result = await stage({
              data: {
                sourceProfileUrl: report.sourceProfileUrl,
                sellerName: report.sellerName,
                mode: "refresh",
                authorized: scanAuthorized,
                items: [item],
              },
            });
            sellerNew += result.staged;
            sellerChanged += result.updated;
            sellerRemoved += result.flaggedRemoved;
            sellerFailed += result.failed;
          } catch {
            sellerFailed++;
          }
        }
        const evidence = { ...report.scan, unreadable: report.scan.unreadable + sellerFailed };
        if (mayInferScanAbsence(evidence)) {
          const seen = new Set(
            report.seenUrls.map((u) => canonicalImportSource(report.sourceProfileUrl, u)),
          );
          for (const target of all.filter(
            (t) =>
              t.sourceProfileUrl === report.sourceProfileUrl &&
              !seen.has(canonicalImportSource(report.sourceProfileUrl, t.sourceUrl)),
          )) {
            try {
              const result = await stage({
                data: {
                  sourceProfileUrl: report.sourceProfileUrl,
                  mode: "refresh",
                  authorized: scanAuthorized,
                  items: [],
                  scan: evidence,
                  finalizeScan: true,
                  seenUrls: report.seenUrls,
                  removalSourceUrl: target.sourceUrl,
                },
              });
              sellerRemoved += result.flaggedRemoved;
            } catch {
              sellerFailed++;
            }
          }
        }
        setScanReports((current) => [
          ...current,
          {
            profile: report.sourceProfileUrl,
            scanned: report.scanned,
            discovered: report.discovered,
            newCount: sellerNew,
            changed: sellerChanged,
            removed: sellerRemoved,
            unread: report.scan.unreadable,
            failed: sellerFailed,
            complete: mayInferScanAbsence(evidence),
          },
        ]);
        checked += report.scanned;
        discovered += report.discovered;
        newCount += sellerNew;
        changed += sellerChanged;
        removed += sellerRemoved;
        unread += report.scan.unreadable;
        failed += sellerFailed;
        diagnostics.push(...groupUnreadable(report.unreadableReasons, report.scan.unreadable));
      }
      return {
        checked,
        discovered,
        newCount,
        changed,
        removed,
        unread,
        failed,
        unreadGroups: diagnostics,
      };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      await queryClient.invalidateQueries({ queryKey: ["fb-import-profiles"] });
      setUnreadReport(result.unread ? result.unreadGroups : null);
      toast.success(
        `Scanned ${result.checked}; discovered ${result.discovered}; ${result.newCount} new, ${result.changed} changed, ${result.removed} removed, ${result.failed} staging failures (retry Refresh).` +
          (result.unread
            ? `. ${result.unread} couldn't be read and were left unchanged — see the breakdown under Imported sellers.`
            : "."),
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not refresh."),
    onSettled: () => setProgress(null),
  });

  if (!data?.length) return null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-[240px] flex-1">
          <h2 className="text-[13px] font-semibold">Imported sellers</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Scan seller profiles for new listings and changes. Incomplete scans leave unseen records
            unchanged. Nothing is published automatically.
            {extensionReady
              ? ""
              : " Extension 1.5 or newer not detected — reload the updated extension, then reload this page."}
          </p>
        </div>
        <label className="text-xs">
          <input
            type="checkbox"
            checked={scanAuthorized}
            onChange={(e) => setScanAuthorized(e.target.checked)}
          />{" "}
          Sellers authorized these scans.
        </label>
        <Button
          type="button"
          onClick={() => refreshMutation.mutate(null)}
          disabled={!extensionReady || !scanAuthorized || refreshMutation.isPending}
          className="h-9 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {refreshMutation.isPending && progress
            ? `Checking ${progress.done}/${progress.total}…`
            : "Refresh all"}
        </Button>
      </div>
      {scanReports.length > 0 && (
        <ul role="status" className="border-b border-border p-4 text-xs space-y-2">
          {scanReports.map((r) => (
            <li key={r.profile}>
              <span className="font-semibold">
                {sourceSiteName(r.profile)} · {r.profile}
              </span>
              <br />
              Scanned {r.scanned} · discovered {r.discovered} · new {r.newCount} · changed{" "}
              {r.changed} · removed {r.removed} · unreadable {r.unread} · staging failures{" "}
              {r.failed} ·{" "}
              {r.complete
                ? "Complete"
                : "Incomplete — unseen records left unchanged; retry Refresh"}
            </li>
          ))}
        </ul>
      )}
      {unreadReport && (
        <div role="status" className="border-b border-border bg-secondary/50 px-4 py-3 text-[12px]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">
              {unreadReport.reduce((sum, g) => sum + g.count, 0)} listing(s) couldn't be read. Those
              records were left unchanged.
            </p>
            <button type="button" className="underline" onClick={() => setUnreadReport(null)}>
              Hide
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {unreadReport.map((g) => (
              <li key={`${g.site}-${g.reason}`}>
                <span className="numeric font-medium">{g.count}</span> · {g.site} ·{" "}
                {UNREADABLE_REASON_LABELS[g.reason] ?? g.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul>
        {data.map((profile) => {
          const ageMs = Date.now() - new Date(profile.lastStagedAt).getTime();
          const days = Math.floor(ageMs / DAY_MS);
          const due = profile.publishedCount > 0 && ageMs >= DAY_MS;
          return (
            <li
              key={profile.sourceProfileUrl}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-[200px] flex-1">
                <p className="text-[12.5px] font-medium">
                  {profile.sellerName || profile.sourceProfileUrl}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {profile.publishedCount} published · {profile.openCount} ready to publish · last
                  refreshed {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}
                </p>
              </div>
              <PrepareSellerClaimButton
                profile={profile.sourceProfileUrl}
                name={profile.sellerName || "Seller"}
              />
              {due ? (
                <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Due for refresh
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => refreshMutation.mutate(profile.sourceProfileUrl)}
                disabled={!extensionReady || !scanAuthorized || refreshMutation.isPending}
                className="h-8 rounded-md border border-input px-3 text-[11.5px] font-medium hover:bg-secondary disabled:opacity-50"
              >
                Refresh
              </button>
              {profile.sellerSlug ? (
                <>
                  {/* For sending the seller their own share link, before they've claimed
                      their account and can get it from the seller dashboard. */}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(sellerShareUrl(profile.sellerSlug ?? ""))
                        .then(() => toast.success("Share link copied."))
                        .catch(() => toast.error("Couldn't copy the link."));
                    }}
                    className="h-8 rounded-md border border-input px-3 text-[11.5px] font-medium hover:bg-secondary"
                  >
                    Copy share link
                  </button>
                  <a
                    href={`/sellers/${profile.sellerSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11.5px] text-primary hover:underline"
                  >
                    Storefront
                  </a>
                </>
              ) : null}
              <a
                href={profile.sourceProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11.5px] text-primary hover:underline"
              >
                Open profile
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StageForm() {
  const queryClient = useQueryClient();
  const stage = useServerFn(stageFacebookImportBatch);

  const [profileUrl, setProfileUrl] = useState("");
  const [itemsJson, setItemsJson] = useState("");

  const mutation = useMutation({
    mutationFn: async (override?: { profileUrl: string; itemsJson: string }) => {
      const sourceProfileUrl = override?.profileUrl ?? profileUrl;
      let parsed: unknown;
      try {
        parsed = JSON.parse(override?.itemsJson ?? itemsJson);
      } catch {
        throw new Error("Paste valid JSON of the extracted listings.");
      }
      // Accept either a bare array, or { sellerName, items } if the
      // extraction happened to capture the seller's name from their profile.
      const sellerName =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? String((parsed as { sellerName?: string }).sellerName ?? "")
          : "";
      const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
      if (!Array.isArray(items)) throw new Error("Expected a JSON array of listings.");

      const totals = { staged: 0, updated: 0, failed: 0 };
      for (const item of items) {
        try {
          const result = await stage({
            data: {
              sourceProfileUrl,
              sellerName: sellerName || undefined,
              items: [item as FbImportItemInput],
            },
          });
          totals.staged += result.staged;
          totals.updated += result.updated;
          totals.failed += result.failed;
        } catch {
          totals.failed++;
        }
      }
      return totals;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      await queryClient.invalidateQueries({ queryKey: ["fb-import-profiles"] });
      toast.success(
        `Staged ${result.staged} new, ${result.updated} changed. ${result.failed} failed.`,
      );
      if (!result.failed) setItemsJson("");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not stage this batch."),
  });

  // The Chrome extension posts the extracted batch straight to this page
  // (same origin only) and it fills the form; the admin still clicks
  // Stage batch themselves. Staging is gated server-side to admins.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; text?: unknown; requestId?: string } | null;
      if (data?.type !== "gemlist-fb-import" || typeof data.text !== "string") return;
      try {
        const parsed = JSON.parse(data.text) as { sourceProfileUrl?: string };
        const url = String(parsed?.sourceProfileUrl ?? "");
        setProfileUrl(url);
        setItemsJson(data.text);
        window.postMessage(
          { type: "gemlist-fb-import-received", requestId: data.requestId },
          window.location.origin,
        );
        toast.success("Batch received from the extension. Click Stage batch when ready.");
      } catch {
        toast.error("The extension sent data that wasn't valid JSON.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty.");
        return;
      }
      const parsed = JSON.parse(text);
      const url =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? String((parsed as { sourceProfileUrl?: string }).sourceProfileUrl ?? "")
          : "";
      if (url) setProfileUrl(url);
      setItemsJson(text);
      toast.success("Pasted from clipboard. Review the profile URL, then stage.");
    } catch {
      toast.error("Clipboard didn't contain valid JSON from the bookmarklet.");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-[14px] font-semibold">Stage a batch</h2>
      <p className="mt-1 max-w-[700px] text-[12.5px] leading-relaxed text-muted-foreground">
        With a live browser session, walk the seller's Facebook Marketplace profile, KSL listings
        page, Vinted profile, Whatnot shop or Diesel Depot inventory and every listing's detail
        page, then hand the extracted data to Bluebird below.
      </p>
      <div className="mt-3 rounded-md border border-dashed border-border bg-secondary/40 p-3">
        <p className="text-[12px] font-semibold">
          Option A: Chrome extension{" "}
          <span className="font-normal text-muted-foreground">
            (fully automatic, including scrolling)
          </span>
        </p>
        <p className="mt-1 max-w-[700px] text-[11.5px] leading-relaxed text-muted-foreground">
          One-time setup, in your own Chrome: open <code>chrome://extensions</code>, turn on{" "}
          <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong>, and
          select the <code>tools/fb-import-extension</code> folder from your local copy of this
          repo. Then, on a seller's Facebook Marketplace profile, KSL listings page
          (classifieds.ksl.com/search/member/...), Vinted profile, Whatnot profile or Diesel Depot
          inventory page, click the extension's icon in your toolbar -- it scrolls, fetches every
          listing's details, and copies the result to your clipboard on its own. (Facebook's grid
          ignores a script-faked scroll, so the extension uses Chrome's own debugger API to send a
          real one -- you'll see a brief "started debugging this browser" notice each run; that's
          expected. Version 1.5 or newer uses two reusable reader windows for imports and all
          Refresh actions; if a site asks you to verify you're human, complete the check there and
          the import carries on.)
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-secondary/40 p-3">
        <div>
          <p className="text-[12px] font-semibold">
            Option B: Bookmarklet{" "}
            <span className="font-normal text-muted-foreground">(no install, one manual step)</span>
          </p>
          <div className="mt-2">
            <BookmarkletLink />
          </div>
        </div>
        <p className="max-w-[380px] text-[11.5px] leading-relaxed text-muted-foreground">
          Drag that to your bookmarks bar once. On a seller's profile page, click it, scroll down
          through their listings yourself until no new ones appear (Facebook only loads more as you
          actually scroll), click "Done scrolling", then "Fetch details", then "Copy JSON".
        </p>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="ml-auto inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
        >
          Paste from clipboard
        </button>
      </div>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(undefined);
        }}
      >
        <label className="text-[12px] font-medium sm:col-span-2">
          Seller or dealer inventory URL
          <input
            required
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            placeholder="https://www.facebook.com/marketplace/profile/..."
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="text-[12px] font-medium sm:col-span-2">
          Extracted listings (JSON array)
          <textarea
            required
            rows={8}
            value={itemsJson}
            onChange={(e) => setItemsJson(e.target.value)}
            placeholder='[{"sourceUrl": "...", "title": "...", ...}]'
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[11.5px]"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex h-10 w-fit items-center rounded-md bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Staging…" : "Stage batch"}
        </button>
      </form>
    </section>
  );
}

function ReviewRow({
  item,
  selected,
  onToggleSelected,
  onDirtyChange,
  publishError,
}: {
  item: FbImportItem;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  publishError?: string;
}) {
  const queryClient = useQueryClient();
  const keep = useServerFn(keepBluebirdImportVersion);
  const keepMutation = useMutation({
    mutationFn: () => keep({ data: { itemId: item.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = useServerFn(updateFacebookImportItem);
  const discardItem = useServerFn(discardFacebookImportItem);

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2));
  const [condition, setCondition] = useState(item.condition ?? "used_good");
  const [categorySlug, setCategorySlug] = useState(item.categorySlug);
  const [subcategory, setSubcategory] = useState(
    importedSubcategory(item.categorySlug, item.itemDetails),
  );
  const subcategoryOptions =
    fieldsForClassifiedItem(categorySlug).find(
      (field) => field.key === importSubcategoryField(categorySlug),
    )?.options ?? [];
  const [city, setCity] = useState(item.city);
  const [state, setState] = useState(item.state);
  const unknownIdahoCity = state === "ID" && city.trim() !== "" && !findIdahoPlace(city);
  const [region, setRegion] = useState(item.region);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(item.id, dirty);
  }, [dirty, item.id, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateItem({
        data: {
          itemId: item.id,
          title,
          description,
          priceCents: Math.round(Number(price) * 100),
          condition,
          categorySlug,
          subcategory,
          itemDetails: item.itemDetails,
          city,
          state,
          region,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save this listing."),
  });

  const discardMutation = useMutation({
    mutationFn: () => discardItem({ data: { itemId: item.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      toast.success("Discarded.");
    },
  });

  return (
    <li className="border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap items-start gap-4">
        <label className="mt-1 flex items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelected(e.target.checked)}
            aria-label={`Include ${item.title}`}
          />
        </label>
        <div className="flex gap-2">
          {item.photoUrls.length ? (
            item.photoUrls
              .slice(0, 3)
              .map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
                />
              ))
          ) : (
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-dashed border-border text-[9px] text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="min-w-[280px] flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {statusLabels[item.status] ?? item.status}
            </span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary hover:underline"
            >
              View on{" "}
              {item.sourceUrl.includes("ksl.com")
                ? "KSL"
                : item.sourceUrl.includes("vinted.com")
                  ? "Vinted"
                  : item.sourceUrl.includes("whatnot.com")
                    ? "Whatnot"
                    : item.sourceUrl.includes("diesel-depot.com")
                      ? "Diesel Depot"
                      : "Facebook"}
            </a>
          </div>
          {item.status === "needs_update" && item.previousPriceCents != null ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Was ${(item.previousPriceCents / 100).toFixed(2)}
            </p>
          ) : null}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-medium">
              Title
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              />
            </label>
            <label className="text-[11px] font-medium">
              Price (USD)
              <input
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setDirty(true);
                }}
                inputMode="decimal"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              />
            </label>
            <label className="text-[11px] font-medium">
              Category
              <select
                value={categorySlug}
                onChange={(e) => {
                  setCategorySlug(e.target.value);
                  setSubcategory("");
                  setDirty(true);
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              >
                {classifiedCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium">
              Subcategory
              <input
                value={subcategory}
                list={`import-subcategory-${item.id}`}
                onChange={(e) => {
                  setSubcategory(e.target.value);
                  setDirty(true);
                }}
                placeholder="Choose or enter a subcategory"
                maxLength={200}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              />
              <datalist id={`import-subcategory-${item.id}`}>
                {subcategoryOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label className="text-[11px] font-medium">
              Condition
              <select
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value);
                  setDirty(true);
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              >
                {conditions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium">
              City
              {state === "ID" ? (
                <IdahoCityPicker
                  value={city}
                  onChange={(next) => {
                    setCity(next);
                    setDirty(true);
                  }}
                  invalid={unknownIdahoCity}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
                />
              ) : (
                <input
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setDirty(true);
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
                />
              )}
              {!city.trim() && (
                <span className="mt-1 block font-normal text-destructive">
                  Choose this listing&apos;s city before publishing.
                </span>
              )}
              {unknownIdahoCity && (
                <span className="mt-1 block font-normal text-destructive">
                  Not a listed Idaho city; pick the nearest one so distance search finds it.
                </span>
              )}
            </label>
            <label className="text-[11px] font-medium">
              State (2-letter)
              <input
                value={state}
                maxLength={2}
                onChange={(e) => {
                  setState(e.target.value.toUpperCase());
                  setDirty(true);
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px] uppercase"
              />
            </label>
            <label className="text-[11px] font-medium sm:col-span-2">
              Region / area {state === "ID" ? "(set from the city)" : "(optional)"}
              <input
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setDirty(true);
                }}
                placeholder="Treasure Valley, Southwest Idaho, ..."
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              />
            </label>
            <label className="text-[11px] font-medium sm:col-span-2">
              Description
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12.5px]"
              />
            </label>
          </div>
          {publishError && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {publishError}
            </p>
          )}
          {item.syncConflict && (
            <div role="alert" className="mt-3 rounded-xl bg-secondary p-3 text-sm">
              <p>{item.syncConflict}</p>
              <button
                type="button"
                className="mt-2 underline"
                disabled={keepMutation.isPending}
                onClick={() => keepMutation.mutate()}
              >
                Keep Bluebird version and clear this sync change
              </button>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            {dirty ? (
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="h-8 rounded-md bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Save changes
              </button>
            ) : null}
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setTitle(item.title);
                  setDescription(item.description ?? "");
                  setPrice((item.priceCents / 100).toFixed(2));
                  setCondition(item.condition ?? "used_good");
                  setCategorySlug(item.categorySlug);
                  setSubcategory(importedSubcategory(item.categorySlug, item.itemDetails));
                  setCity(item.city);
                  setState(item.state);
                  setRegion(item.region);
                  setDirty(false);
                }}
                className="h-8 rounded-md border border-input px-3 text-[11.5px] font-medium hover:bg-secondary"
              >
                Revert edits
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => discardMutation.mutate()}
              disabled={discardMutation.isPending}
              className="h-8 rounded-md border border-input px-3 text-[11.5px] font-medium text-destructive hover:bg-secondary"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function FbImportPage() {
  const fetchItems = useServerFn(getFacebookImportItems);
  const publish = useServerFn(publishFacebookImportItems);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["fb-import-items"],
    queryFn: () => fetchItems(),
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellerEmail, setSellerEmail] = useState("");
  const [publishMode, setPublishMode] = useState<"managed" | "linked">("managed");
  const [authorized, setAuthorized] = useState(false);
  const [claimUrl, setClaimUrl] = useState("");
  const [sellerDisplayName, setSellerDisplayName] = useState("");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const onDirtyChange = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const hasUnsavedSelection = Array.from(selectedIds).some((id) => dirtyIds.has(id));
  const fetchProfileNames = useServerFn(getFacebookImportProfiles);
  const { data: profileRows } = useQuery({
    queryKey: ["fb-import-profiles"],
    queryFn: () => fetchProfileNames(),
  });
  const profileNames = Object.fromEntries(
    (profileRows ?? [])
      .filter((p) => p.sellerName)
      .map((p) => [queueProfileKey(p.sourceProfileUrl), p.sellerName as string]),
  );
  const [visibleRows, setVisibleRows] = useState(50);
  const queueItems = data ?? [];
  const sellerGroups = groupQueueBySeller(queueItems, profileNames);
  const selectedSellerKeys = selectedProfiles(queueItems, selectedIds);
  const blocker = publishBlocker({
    items: queueItems,
    selectedIds,
    dirtyIds,
    authorized,
    linkedNeedsEmail: false,
  });
  const actionSummary = blocker ? null : describeAction(queueItems, selectedIds);
  const selectSeller = (profile: string) =>
    setSelectedIds(new Set(sellerGroups.find((g) => g.profile === profile)?.itemIds ?? []));

  // Nothing is preselected: publishing is one seller at a time. Items that
  // have been discarded or published drop out of the selection.
  useEffect(() => {
    if (!data) return;
    setSelectedIds((current) => {
      const live = new Set(data.map((item) => item.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
    // Only re-run when the set of item ids actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.map((item) => item.id).join(",")]);

  const toggleSelected = (itemId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (blocker) throw new Error(blocker);
      const { results, failures } = await runImportRows(
        [...selectedIds],
        (id) =>
          publish({
            data: {
              itemIds: [id],
              sellerEmail,
              mode: publishMode,
              authorized,
              sellerDisplayName: sellerDisplayName || undefined,
            },
          }),
        (done, total) => setApplyProgress({ done, total }),
      );
      const itemFailures = [...failures, ...results.flatMap((r) => r.itemFailures)];
      return {
        created: results.reduce((n, r) => n + r.created, 0),
        updated: results.reduce((n, r) => n + r.updated, 0),
        removed: results.reduce((n, r) => n + r.removed, 0),
        errors: itemFailures.length,
        itemFailures,
      };
    },
    onSuccess: async (result) => {
      setPublishErrors(
        Object.fromEntries(
          (result.itemFailures ?? []).map((failure) => [failure.itemId, failure.message]),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ["managed-import-sellers"] });
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      await queryClient.invalidateQueries({ queryKey: ["fb-import-profiles"] });
      setSelectedIds(new Set((result.itemFailures ?? []).map((failure) => failure.itemId)));
      const applied = result.created + result.updated + result.removed;
      if (result.errors)
        toast.error(
          `${result.errors} listing(s) could not publish. Errors appear beside each listing.`,
        );
      if (applied)
        toast.success(
          `Published ${result.created}, updated ${result.updated}, removed ${result.removed}.`,
        );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not publish selected items."),
  });

  const setCategory = useServerFn(setFacebookImportItemsCategory);
  const [bulkCategory, setBulkCategory] = useState("");
  const bulkCategoryMutation = useMutation({
    mutationFn: async () => {
      let items = 0;
      const ids = [...selectedIds];
      for (let i = 0; i < ids.length; i += 100)
        items += (
          await setCategory({
            data: { itemIds: ids.slice(i, i + 100), categorySlug: bulkCategory },
          })
        ).items;
      return { items };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      toast.success(`Set the category on ${result.items} listing(s).`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not set the category."),
  });

  const setCityFn = useServerFn(setFacebookImportItemsCity);
  const [bulkCity, setBulkCity] = useState("");
  const [bulkCityOnlyMissing, setBulkCityOnlyMissing] = useState(true);
  const bulkCityMutation = useMutation({
    mutationFn: async () => {
      let items = 0;
      const ids = [...selectedIds];
      for (let i = 0; i < ids.length; i += 100)
        items += (
          await setCityFn({
            data: {
              itemIds: ids.slice(i, i + 100),
              city: bulkCity,
              onlyMissing: bulkCityOnlyMissing,
            },
          })
        ).items;
      return { items, city: bulkCity };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      toast.success(`Set ${result.city} on ${result.items} listing(s).`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not set the city."),
  });

  const clearAll = useServerFn(discardAllFacebookImportItems);
  const clearAllMutation = useMutation({
    mutationFn: () => clearAll(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      setSelectedIds(new Set());
      toast.success(`Cleared ${result.cleared} listing(s).`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not clear the list."),
  });

  return (
    <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Gem State operations
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Facebook seller import</h1>
        <p className="mt-1 max-w-[720px] text-[13px] leading-relaxed text-muted-foreground">
          With a seller's permission, recreate their Facebook Marketplace listings as real GemList
          listings under their own account. Every extraction is driven by a person in a live,
          logged-in browser session — nothing here stores a Facebook session or runs on a schedule.
        </p>
      </div>

      <StageForm />

      <ImportedSellers />
      {claimUrl && <ClaimLinkResult url={claimUrl} onClose={() => setClaimUrl("")} />}
      <ManagedSellerOperations />

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">
            Ready to publish{" "}
            <span className="numeric text-muted-foreground">{data?.length ?? 0}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Publishing destination"
              value={publishMode}
              onChange={(e) => setPublishMode(e.target.value as "managed" | "linked")}
              className="field text-sm"
            >
              <option value="managed">Managed seller — keep existing claim link</option>
              <option value="linked">Existing linked seller</option>
            </select>
            {publishMode === "linked" && (
              <input
                type="email"
                value={sellerEmail}
                onChange={(e) => setSellerEmail(e.target.value)}
                placeholder="Seller's email"
                title="Existing seller account email; not needed for an already linked imported profile"
                className="h-9 w-[180px] rounded-md border border-input bg-background px-2 text-[12px]"
              />
            )}
            <input
              value={sellerDisplayName}
              onChange={(e) => setSellerDisplayName(e.target.value)}
              placeholder="Display name (optional)"
              className="h-9 w-[180px] rounded-md border border-input bg-background px-2 text-[12px]"
            />
            <label className="flex max-w-[280px] items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
              />
              The seller authorized Bluebird to import and manage these listings.
            </label>
            <button
              type="button"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || blocker !== null}
              aria-describedby="publish-blocker"
              className="h-9 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {publishMutation.isPending
                ? `Applying ${applyProgress?.done ?? 0}/${applyProgress?.total ?? selectedIds.size}…`
                : publishMode === "managed"
                  ? "Apply for managed seller"
                  : "Apply for linked seller"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!data?.length) return;
                if (
                  !window.confirm(
                    `Discard all ${data.length} staged listing(s)? This can't be undone -- nothing will be published.`,
                  )
                )
                  return;
                clearAllMutation.mutate();
              }}
              disabled={clearAllMutation.isPending || !data?.length}
              className="h-9 rounded-md border border-input px-3 text-[12px] font-medium text-destructive hover:bg-secondary disabled:opacity-50"
            >
              {clearAllMutation.isPending ? "Clearing…" : "Clear list"}
            </button>
          </div>
        </div>
        <p
          id="publish-blocker"
          role="status"
          className={`px-4 pt-3 text-xs ${blocker ? "text-primary" : "text-muted-foreground"}`}
        >
          {blocker ??
            `${actionSummary}. New listings go live immediately; updates apply to the existing Bluebird listings; possibly-removed listings are taken offline, not republished.`}
        </p>
        {sellerGroups.length > 0 && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium">Choose one seller to apply</p>
              <button
                type="button"
                className="text-[12px] underline disabled:opacity-50"
                disabled={!selectedIds.size}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </button>
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {sellerGroups.map((g) => {
                const active =
                  selectedSellerKeys.length === 1 && selectedSellerKeys[0] === g.profile;
                const picked = g.itemIds.filter((id) => selectedIds.has(id)).length;
                return (
                  <li
                    key={g.profile}
                    className={`rounded-md border p-3 text-[12px] ${active ? "border-primary" : "border-border"}`}
                  >
                    <p className="break-words font-semibold">
                      {g.name} <span className="font-normal text-muted-foreground">· {g.site}</span>
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {g.newCount} new · {g.updateCount} needs update · {g.removedCount} sold or
                      removed{picked ? ` · ${picked} selected` : ""}
                    </p>
                    <button
                      type="button"
                      className="mt-2 h-8 rounded-md border border-input px-3 font-medium hover:bg-secondary"
                      onClick={() => selectSeller(g.profile)}
                    >
                      {active && picked === g.itemIds.length
                        ? "All selected"
                        : `Select all ${g.itemIds.length} from this seller`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <span className="text-[12px] font-medium">Set category for selected</span>
          <select
            aria-label="Category for selected listings"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-[12px]"
          >
            <option value="">Choose a category</option>
            {classifiedCategories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => bulkCategoryMutation.mutate()}
            disabled={
              !bulkCategory ||
              !selectedIds.size ||
              hasUnsavedSelection ||
              bulkCategoryMutation.isPending
            }
            className="h-9 rounded-md border border-input px-3 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
          >
            {bulkCategoryMutation.isPending ? "Applying…" : `Apply to ${selectedIds.size} selected`}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <span className="text-[12px] font-medium">Set city for selected</span>
          <IdahoCityPicker
            value={bulkCity}
            onChange={setBulkCity}
            invalid={bulkCity.trim() !== "" && !findIdahoPlace(bulkCity)}
            placeholder="Idaho city"
            className="h-9 w-48 rounded-md border border-input bg-background px-2 text-[12px]"
          />
          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={bulkCityOnlyMissing}
              onChange={(e) => setBulkCityOnlyMissing(e.target.checked)}
            />
            Only listings without a city
          </label>
          <button
            type="button"
            onClick={() => bulkCityMutation.mutate()}
            disabled={
              !findIdahoPlace(bulkCity) ||
              !selectedIds.size ||
              hasUnsavedSelection ||
              bulkCityMutation.isPending
            }
            className="h-9 rounded-md border border-input px-3 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
          >
            {bulkCityMutation.isPending ? "Applying…" : `Apply to ${selectedIds.size} selected`}
          </button>
        </div>

        {isLoading ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">Loading…</p>
        ) : !data?.length ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
            Nothing staged. Stage a batch above to get started.
          </p>
        ) : (
          <ul>
            <li className="p-4 text-xs">
              Showing {Math.min(visibleRows, data.length)} of {data.length} rows ·{" "}
              {selectedIds.size} selected across the full queue
            </li>
            {data.slice(0, visibleRows).map((item) => (
              <ReviewRow
                // Remount when the category or city changes elsewhere (bulk set) so
                // the row's own form shows the new value.
                key={`${item.id}:${item.categorySlug}:${item.city}:${importedSubcategory(item.categorySlug, item.itemDetails)}`}
                item={item}
                selected={selectedIds.has(item.id)}
                onToggleSelected={(checked) => toggleSelected(item.id, checked)}
                onDirtyChange={onDirtyChange}
                publishError={publishErrors[item.id]}
              />
            ))}
            {visibleRows < data.length && (
              <li className="p-4">
                <Button variant="outline" onClick={() => setVisibleRows((n) => n + 50)}>
                  Show next 50 ({data.length - visibleRows} remaining)
                </Button>
              </li>
            )}
          </ul>
        )}
      </section>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { classifiedCategories } from "@/config/classifieds";
import {
  discardAllFacebookImportItems,
  discardFacebookImportItem,
  getFacebookImportItems,
  publishFacebookImportItems,
  stageFacebookImportBatch,
  updateFacebookImportItem,
  type FbImportItem,
} from "@/lib/fb-import.functions";
import bookmarkletSource from "../../../tools/facebook-import-bookmarklet.js?raw";

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
  ["used_excellent", "Used — excellent"],
  ["used_good", "Used — good"],
] as const;

const statusLabels: Record<string, string> = {
  draft: "New",
  needs_update: "Needs update",
  possibly_removed: "No longer on Facebook",
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

      return stage({
        data: {
          sourceProfileUrl,
          sellerName: sellerName || undefined,
          items: items as never[],
        },
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      toast.success(
        `Staged ${result.staged} new, ${result.updated} changed. ${result.failed} failed.`,
      );
      setItemsJson("");
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
      const data = event.data as { type?: string; text?: unknown } | null;
      if (data?.type !== "gemlist-fb-import" || typeof data.text !== "string") return;
      try {
        const parsed = JSON.parse(data.text) as { sourceProfileUrl?: string };
        const url = String(parsed?.sourceProfileUrl ?? "");
        setProfileUrl(url);
        setItemsJson(data.text);
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
        With a live, logged-in browser session, walk the seller's Facebook Marketplace profile and
        every listing's detail page, then hand the extracted data to GemList below.
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
          repo. Then, on a seller's Facebook Marketplace profile page, click the extension's icon in
          your toolbar -- it scrolls, fetches every listing's details, and copies the result to your
          clipboard on its own. (Facebook's grid ignores a script-faked scroll, so the extension
          uses Chrome's own debugger API to send a real one -- you'll see a brief "started debugging
          this browser" notice each run; that's expected.)
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
          Seller's Facebook Marketplace profile URL
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
}: {
  item: FbImportItem;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const updateItem = useServerFn(updateFacebookImportItem);
  const discardItem = useServerFn(discardFacebookImportItem);

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2));
  const [condition, setCondition] = useState(item.condition ?? "used_good");
  const [categorySlug, setCategorySlug] = useState(item.categorySlug);
  const [city, setCity] = useState(item.city);
  const [state, setState] = useState(item.state);
  const [region, setRegion] = useState(item.region);
  const [dirty, setDirty] = useState(false);

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
              View on Facebook
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
              <input
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setDirty(true);
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
              />
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
              Region / area
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
  const [sellerDisplayName, setSellerDisplayName] = useState("");

  // New items default to selected; items that have since been discarded or
  // published drop out of `data` and should drop out of the selection too.
  useEffect(() => {
    if (!data) return;
    setSelectedIds((current) => {
      const next = new Set<string>();
      for (const item of data) {
        if (current.has(item.id) || !current.size) next.add(item.id);
      }
      return next;
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
    mutationFn: () =>
      publish({
        data: {
          itemIds: Array.from(selectedIds),
          sellerEmail,
          sellerDisplayName: sellerDisplayName || undefined,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fb-import-items"] });
      setSelectedIds(new Set());
      toast.success(
        `Created ${result.created}, updated ${result.updated}, removed ${result.removed}. ${result.errors} failed.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not publish selected items."),
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

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">
            Awaiting review{" "}
            <span className="numeric text-muted-foreground">{data?.length ?? 0}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={sellerEmail}
              onChange={(e) => setSellerEmail(e.target.value)}
              placeholder="Seller's email"
              title="The seller's GemList account email -- only needed once, right before publishing"
              className="h-9 w-[180px] rounded-md border border-input bg-background px-2 text-[12px]"
            />
            <input
              value={sellerDisplayName}
              onChange={(e) => setSellerDisplayName(e.target.value)}
              placeholder="Display name (optional)"
              className="h-9 w-[180px] rounded-md border border-input bg-background px-2 text-[12px]"
            />
            <button
              type="button"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !data?.length || !sellerEmail}
              className="h-9 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {publishMutation.isPending ? "Applying…" : "Apply selected"}
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
        {isLoading ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">Loading…</p>
        ) : !data?.length ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
            Nothing staged. Stage a batch above to get started.
          </p>
        ) : (
          <ul>
            {data.map((item) => (
              <ReviewRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onToggleSelected={(checked) => toggleSelected(item.id, checked)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import {
  adminCreateProduct,
  adminReviewAsk,
  adminReviewSuggestion,
  adminUpdateAskPrice,
  getAdminCatalogConsole,
} from "@/lib/admin-catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  head: () => ({
    meta: [
      { title: "GemList catalog operations" },
      {
        name: "description",
        content:
          "Administrator-only console for managing GemList catalog pages, reviewing member requests and approving listings.",
      },
      { property: "og:title", content: "GemList catalog operations" },
      {
        property: "og:description",
        content: "Administrator-only catalog creation and trust review for GemList.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCatalogPage,
});

const conditionLabels: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

const statusOptions = [
  { value: "draft", label: "Draft (hidden)" },
  { value: "pending_review", label: "Pending review" },
  { value: "published", label: "Published" },
];

const releaseOptions = [
  { value: "unknown", label: "Unknown" },
  { value: "open_edition", label: "Open edition" },
  { value: "limited_release", label: "Limited release" },
  { value: "limited_edition", label: "Limited edition" },
  { value: "seasonal", label: "Seasonal" },
  { value: "event_exclusive", label: "Event exclusive" },
  { value: "annual_passholder", label: "Annual passholder" },
];

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "block text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground";
const buttonClass =
  "inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-60";

function Panel({
  title,
  children,
  note,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {note ? <p className="mt-1 text-[12px] text-muted-foreground">{note}</p> : null}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const fetchConsole = useServerFn(getAdminCatalogConsole);
  const createProduct = useServerFn(adminCreateProduct);
  const reviewSuggestion = useServerFn(adminReviewSuggestion);
  const reviewAsk = useServerFn(adminReviewAsk);
  const updateAskPrice = useServerFn(adminUpdateAskPrice);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-catalog-console"],
    queryFn: () => fetchConsole(),
  });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    categoryId: "",
    resortCodes: [] as string[],
    variations: "",
    brandText: "",
    collectionText: "",
    description: "",
    releaseType: "unknown",
    releaseDate: "",
    retailPrice: "",
    retailPriceSource: "",
    status: "draft",
    suggestionId: "",
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-catalog-console"] });
  };

  const create = useMutation({
    mutationFn: () =>
      createProduct({
        data: {
          name: form.name,
          slug: form.slug,
          categoryId: form.categoryId,
          resortCodes: form.resortCodes,
          variations: form.variations
            .split(/[\n,]/)
            .map((v) => v.trim())
            .filter(Boolean),
          brandText: form.brandText,
          collectionText: form.collectionText,
          description: form.description,
          releaseType: form.releaseType,
          releaseDate: form.releaseDate,
          retailPriceCents: form.retailPrice.trim()
            ? Math.round(Number(form.retailPrice.replace(/[^0-9.]/g, "")) * 100)
            : null,
          retailPriceSource: form.retailPriceSource,
          status: form.status,
          suggestionId: form.suggestionId,
        },
      }),
    onSuccess: () => {
      toast.success("Catalog page created. Add owned photography before publishing.");
      setForm((f) => ({
        ...f,
        name: "",
        slug: "",
        variations: "",
        brandText: "",
        collectionText: "",
        description: "",
        releaseDate: "",
        retailPrice: "",
        retailPriceSource: "",
        suggestionId: "",
      }));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suggestionMutation = useMutation({
    mutationFn: (input: { suggestionId: string; status: string }) =>
      reviewSuggestion({
        data: { ...input, note: notes[input.suggestionId] ?? null },
      }),
    onSuccess: () => {
      toast.success("Request updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askMutation = useMutation({
    mutationFn: (input: { askId: string; approve: boolean }) =>
      reviewAsk({ data: { ...input, note: notes[input.askId] ?? null } }),
    onSuccess: () => {
      toast.success("Listing reviewed.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const priceMutation = useMutation({
    mutationFn: (askId: string) => {
      const raw = (prices[askId] ?? "").replace(/[^0-9.]/g, "");
      const priceCents = Math.round(Number(raw) * 100);
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error("Enter a new price before saving.");
      }
      return updateAskPrice({ data: { askId, priceCents, note: notes[askId] ?? null } });
    },
    onSuccess: () => {
      toast.success("Listing price updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingRequests = useMemo(
    () =>
      (data?.suggestions ?? []).filter((s) => s.status === "submitted" || s.status === "in_review"),
    [data?.suggestions],
  );

  if (isLoading) {
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-muted-foreground">
        This console could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!data?.isAdmin) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Administrator access required</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Catalog creation and listing approval are limited to GemList administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Catalog operations</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Add canonical catalog pages, work through member page requests and review used-condition
          listings. Pages stay in draft until owned photography exists — GemList never publishes
          scraped imagery, and no market activity is ever created here.
        </p>
        <Link to="/admin" className={`${buttonClass} mt-3`}>
          Back to operations
        </Link>
      </div>

      <Panel
        title="Add a catalog page"
        note="Variations are one per line (for example: Standard, Adult, Youth). Each variation gets its own offer and listing market."
      >
        <form
          id="admin-product-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="pv-name">
              Product name
            </label>
            <input
              id="pv-name"
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={3}
              maxLength={160}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-slug">
              URL slug (optional)
            </label>
            <input
              id="pv-slug"
              className={fieldClass}
              placeholder="derived from the name"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-category">
              Category
            </label>
            <select
              id="pv-category"
              className={fieldClass}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="">Choose a category</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className={labelClass}>Resorts where it is sold</legend>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {data.resorts.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={form.resortCodes.includes(r.code)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        resortCodes: e.target.checked
                          ? [...form.resortCodes, r.code]
                          : form.resortCodes.filter((c) => c !== r.code),
                      })
                    }
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="pv-variations">
              Variations
            </label>
            <textarea
              id="pv-variations"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={"Standard"}
              value={form.variations}
              onChange={(e) => setForm({ ...form, variations: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-brand">
              Brand or maker (optional)
            </label>
            <input
              id="pv-brand"
              className={fieldClass}
              value={form.brandText}
              onChange={(e) => setForm({ ...form, brandText: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-collection">
              Collection (optional)
            </label>
            <input
              id="pv-collection"
              className={fieldClass}
              value={form.collectionText}
              onChange={(e) => setForm({ ...form, collectionText: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-release-type">
              Release type
            </label>
            <select
              id="pv-release-type"
              className={fieldClass}
              value={form.releaseType}
              onChange={(e) => setForm({ ...form, releaseType: e.target.value })}
            >
              {releaseOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-release-date">
              Release date (optional)
            </label>
            <input
              id="pv-release-date"
              type="date"
              className={fieldClass}
              value={form.releaseDate}
              onChange={(e) => setForm({ ...form, releaseDate: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-retail">
              Observed in-park price (optional)
            </label>
            <input
              id="pv-retail"
              className={fieldClass}
              inputMode="decimal"
              placeholder="29.99"
              value={form.retailPrice}
              onChange={(e) => setForm({ ...form, retailPrice: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-retail-source">
              Price source (required if a price is entered)
            </label>
            <input
              id="pv-retail-source"
              className={fieldClass}
              placeholder="Where the price was observed"
              value={form.retailPriceSource}
              onChange={(e) => setForm({ ...form, retailPriceSource: e.target.value })}
              required={form.retailPrice.trim().length > 0}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="pv-description">
              Description (optional, written in-house)
            </label>
            <textarea
              id="pv-description"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-status">
              Catalog status
            </label>
            <select
              id="pv-status"
              className={fieldClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pv-request">
              Fulfils member request (optional)
            </label>
            <select
              id="pv-request"
              className={fieldClass}
              value={form.suggestionId}
              onChange={(e) => setForm({ ...form, suggestionId: e.target.value })}
            >
              <option value="">Not from a request</option>
              {pendingRequests.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={buttonClass} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create catalog page"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Requested pages"
        note="Member submissions. Approve a request by creating its catalog page above and selecting it there."
      >
        {data.suggestions.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No members have requested a page yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.suggestions.map((s) => (
              <li key={s.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
                    {s.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {[s.brandText, s.collectionText, s.resortCodes.join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "No extra detail supplied."}
                </p>
                {s.proposedVariations ? (
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Proposed variations: {s.proposedVariations}
                  </p>
                ) : null}
                {s.listingRequest ? (
                  <div className="mt-3 border border-primary/30 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                        Includes an exact-item seller listing
                      </p>
                      <p className="numeric text-[12px] font-semibold">
                        {formatUsd(s.listingRequest.priceCents)} ·{" "}
                        {conditionLabels[s.listingRequest.itemCondition] ??
                          s.listingRequest.itemCondition}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                      {s.listingRequest.sellerNote || "The seller did not add additional notes."}
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <ReviewPhotos
                        title={`Public listing photos (${s.listingRequest.listingImageUrls.length})`}
                        urls={s.listingRequest.listingImageUrls}
                        alt={`${s.name} public listing`}
                      />
                      <ReviewPhotos
                        title={`Private ownership evidence (${s.listingRequest.evidenceImageUrls.length})`}
                        urls={s.listingRequest.evidenceImageUrls}
                        alt={`${s.name} ownership evidence`}
                      />
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                      Create the catalog page above and select this request. GemList will then place
                      the exact item into the normal listing-approval queue; it does not publish
                      automatically.
                    </p>
                  </div>
                ) : null}
                {s.status === "submitted" || s.status === "in_review" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`${buttonClass} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
                      onClick={() => {
                        setForm({
                          ...form,
                          name: s.name,
                          slug: "",
                          categoryId: s.categoryId ?? "",
                          resortCodes: s.resortCodes,
                          variations: s.proposedVariations ?? "",
                          brandText: s.brandText ?? "",
                          collectionText: s.collectionText ?? "",
                          description: s.releaseNotes ?? "",
                          status: "pending_review",
                          suggestionId: s.id,
                        });
                        document
                          .getElementById("admin-product-form")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      {s.listingRequest ? "Review product + listing" : "Load into product form"}
                    </button>
                    <label className="sr-only" htmlFor={`note-${s.id}`}>
                      Reviewer note for {s.name}
                    </label>
                    <input
                      id={`note-${s.id}`}
                      className={`${fieldClass} max-w-[280px]`}
                      placeholder="Reviewer note (optional)"
                      value={notes[s.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                    />
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={suggestionMutation.isPending}
                      onClick={() =>
                        suggestionMutation.mutate({ suggestionId: s.id, status: "in_review" })
                      }
                    >
                      Mark in review
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={suggestionMutation.isPending}
                      onClick={() =>
                        suggestionMutation.mutate({
                          suggestionId: s.id,
                          status: "merged_duplicate",
                        })
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={suggestionMutation.isPending}
                      onClick={() =>
                        suggestionMutation.mutate({ suggestionId: s.id, status: "rejected" })
                      }
                    >
                      Reject
                    </button>
                  </div>
                ) : s.reviewerNote ? (
                  <p className="mt-1 text-[12.5px] text-muted-foreground">Note: {s.reviewerNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Listings awaiting approval"
        note="Review the buyer-visible photos, private ownership evidence, condition, price and seller notes. Nothing in this queue is public until you approve it."
      >
        {data.asks.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No listings are waiting for approval.
          </p>
        ) : (
          <ul className="space-y-5">
            {data.asks.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/products/$slug"
                    params={{ slug: a.productSlug }}
                    className="text-[14px] font-semibold underline-offset-2 hover:underline"
                  >
                    {a.productName}
                  </Link>
                  <span className="border border-brand-warm/40 bg-brand-warm/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-warm">
                    Awaiting approval
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {a.variantLabel} · {conditionLabels[a.itemCondition] ?? a.itemCondition} ·{" "}
                  {a.inHand ? "In hand" : "Not in hand"} · {formatUsd(a.priceCents)} · submitted{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Seller: <span className="font-medium text-foreground">{a.sellerDisplayName}</span>{" "}
                  <span className="numeric">@{a.sellerHandle}</span>
                </p>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <ReviewPhotos
                    title={`Public listing photos (${a.publicMediaCount})`}
                    urls={a.listingImageUrls}
                    alt={`${a.productName} public listing`}
                  />
                  <ReviewPhotos
                    title={`Private ownership evidence (${a.evidenceCount})`}
                    urls={a.evidenceImageUrls}
                    alt={`${a.productName} private ownership evidence`}
                  />
                </div>

                <div className="mt-4 border-y border-border py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Seller notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed">
                    {a.sellerNote || "The seller did not add additional notes."}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`ask-price-${a.id}`}>
                    New price for {a.productName}
                  </label>
                  <input
                    id={`ask-price-${a.id}`}
                    className={`${fieldClass} max-w-[120px]`}
                    inputMode="decimal"
                    placeholder={(a.priceCents / 100).toFixed(2)}
                    value={prices[a.id] ?? ""}
                    onChange={(e) => setPrices({ ...prices, [a.id]: e.target.value })}
                  />
                  <label className="sr-only" htmlFor={`ask-note-${a.id}`}>
                    Review note for {a.productName}
                  </label>
                  <input
                    id={`ask-note-${a.id}`}
                    className={`${fieldClass} max-w-[280px]`}
                    placeholder="Review note (optional)"
                    value={notes[a.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={priceMutation.isPending || !(prices[a.id] ?? "").trim()}
                    onClick={() => priceMutation.mutate(a.id)}
                  >
                    Save price
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
                    disabled={askMutation.isPending}
                    onClick={() => askMutation.mutate({ askId: a.id, approve: true })}
                  >
                    Approve and publish
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={askMutation.isPending}
                    onClick={() => askMutation.mutate({ askId: a.id, approve: false })}
                  >
                    Reject listing
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReviewPhotos({ title, urls, alt }: { title: string; urls: string[]; alt: string }) {
  return (
    <section>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {urls.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden border border-border bg-secondary/50 p-1.5 hover:border-border-strong"
              aria-label={`Open ${title.toLowerCase()} photo ${index + 1}`}
            >
              <img
                src={url}
                alt={`${alt} photo ${index + 1}`}
                className="h-full w-full object-contain"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] text-brand-warm">No photos could be loaded.</p>
      )}
    </section>
  );
}

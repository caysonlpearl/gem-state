import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { getMySuggestions, submitProductSuggestion } from "@/lib/community.functions";

const suggestionStatusLabels: Record<string, string> = {
  submitted: "Submitted — awaiting curator review",
  in_review: "In review",
  approved: "Approved — being added to the catalog",
  rejected: "Not added",
  merged_duplicate: "Already in the catalog",
};

export const Route = createFileRoute("/_authenticated/suggest")({
  head: () => ({
    meta: [
      { title: "Suggest a product · ParkVault" },
      {
        name: "description",
        content:
          "Tell ParkVault curators about a park product that is missing from the canonical catalog so it can be reviewed and added.",
      },
      { property: "og:title", content: "Suggest a product · ParkVault" },
      {
        property: "og:description",
        content: "Missing park merchandise is added by curators after review — suggest it here.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SuggestPage,
});

function SuggestPage() {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitProductSuggestion);
  const fetchMine = useServerFn(getMySuggestions);
  const fetchFacets = useServerFn(getCatalogFacets);

  useEffect(() => {
    void trackEvent("page_view", { route: "/suggest" });
  }, []);

  const mine = useQuery({ queryKey: ["my-suggestions"], queryFn: () => fetchMine() });
  const facets = useQuery({ queryKey: ["catalog-facets"], queryFn: () => fetchFacets() });

  const [name, setName] = useState("");
  const [brandText, setBrandText] = useState("");
  const [collectionText, setCollectionText] = useState("");
  const [resortCodes, setResortCodes] = useState<string[]>([]);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [variations, setVariations] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          name,
          brandText: brandText || null,
          collectionText: collectionText || null,
          resortCodes,
          releaseNotes: releaseNotes || null,
          proposedVariations: variations || null,
        },
      }),
    onSuccess: async () => {
      await trackEvent("product_suggested", { resorts: resortCodes.length });
      await queryClient.invalidateQueries({ queryKey: ["my-suggestions"] });
      setName("");
      setBrandText("");
      setCollectionText("");
      setReleaseNotes("");
      setVariations("");
      setResortCodes([]);
      toast.success("Suggestion sent to the curators for review.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send the suggestion."),
  });

  const list = mine.data ?? [];
  const resorts = facets.data?.geography ?? [];

  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Suggest a product</h1>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
        ParkVault only trades on one canonical page per product, so missing items are added by
        curators rather than created by members. Describe what is missing and a curator reviews it.
        Do not upload artwork or photographs of packaging — curators capture catalog imagery
        themselves.
      </p>

      <form
        className="mt-8 space-y-4 rounded-lg border border-border bg-card px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (resortCodes.length === 0) {
            toast.error("Choose at least one resort where you saw it.");
            return;
          }
          mutation.mutate();
        }}
      >
        <div>
          <label htmlFor="suggestion-name" className="text-[12px] font-medium">
            Product name as it appears in park
          </label>
          <input
            id="suggestion-name"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 160))}
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="suggestion-brand" className="text-[12px] font-medium">
              Maker or brand (optional)
            </label>
            <input
              id="suggestion-brand"
              value={brandText}
              onChange={(event) => setBrandText(event.target.value.slice(0, 120))}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="suggestion-collection" className="text-[12px] font-medium">
              Collection or series (optional)
            </label>
            <input
              id="suggestion-collection"
              value={collectionText}
              onChange={(event) => setCollectionText(event.target.value.slice(0, 120))}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-[12px] font-medium">Where you saw it</legend>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {resorts.map((resort) => (
              <label key={resort.resortId} className="flex items-center gap-1.5 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={resortCodes.includes(resort.resortCode)}
                  onChange={(event) =>
                    setResortCodes((current) =>
                      event.target.checked
                        ? [...current, resort.resortCode]
                        : current.filter((code) => code !== resort.resortCode),
                    )
                  }
                />
                {resort.resortName}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="suggestion-variations" className="text-[12px] font-medium">
            Variations you know of (optional — sizes, colours, editions)
          </label>
          <textarea
            id="suggestion-variations"
            value={variations}
            onChange={(event) => setVariations(event.target.value.slice(0, 600))}
            rows={2}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="suggestion-notes" className="text-[12px] font-medium">
            Release details (optional — when it appeared, whether it was limited)
          </label>
          <textarea
            id="suggestion-notes"
            value={releaseNotes}
            onChange={(event) => setReleaseNotes(event.target.value.slice(0, 600))}
            rows={3}
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Suggestions are limited to 10 per day. A curator decides whether the product is added,
          merged with an existing page, or declined — nothing appears in the catalog automatically.
        </p>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="h-10 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? "Sending…" : "Send suggestion"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-[13px] font-semibold tracking-tight">Your suggestions</h2>
        {mine.isLoading && <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>}
        {!mine.isLoading && list.length === 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            No suggestions yet. Existing pages are in{" "}
            <Link to="/browse" className="underline underline-offset-2">
              the catalog
            </Link>
            .
          </p>
        )}
        {list.length > 0 && (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            {list.map((suggestion) => (
              <li key={suggestion.id} className="hairline-b px-4 py-3 last:border-b-0">
                <p className="text-[12.5px] font-medium">{suggestion.name}</p>
                <p className="numeric mt-0.5 text-[11.5px] text-muted-foreground">
                  {suggestionStatusLabels[suggestion.status] ?? suggestion.status} · sent{" "}
                  {new Date(suggestion.createdAt).toLocaleDateString()}
                </p>
                {suggestion.reviewerNote && (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Curator note: {suggestion.reviewerNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

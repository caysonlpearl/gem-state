import { trackShopping } from "./shopping";
import {
  BrowseResultsView,
  type BrowseLinkProps,
} from "../../../src/components/classifieds/BrowseResultsView";
import { BrowseResultsHeading } from "../../../src/components/classifieds/BrowseResultsHeading";
import { activeFilterLabels, countActiveFilters } from "../../../src/lib/browse-filter-labels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, type Bootstrap } from "./client";
import { browseApiQuery, browseDestination, browseLocation } from "./browse-state";
import { listingPresentation } from "./listing-presentation";
import { ListingTile } from "./ShopperExperience";
import type { MobileBrowse, MobileListing } from "../../../src/lib/mobile-contract";
import { vehicleSearchKeys, firearmSearchKeys, type Search } from "../../../src/lib/browse-search";
import { browseSearchPatchFromForm } from "../../../src/lib/browse-form";
import { isMotorsCategory } from "../../../src/lib/classifieds-display";
import { isInvertedRange } from "../../../src/lib/classifieds-query";
import {
  ServicesFilterPage,
  JobsFilterPage,
  HomesFilterPage,
  VehicleResultsPage,
} from "../../../src/components/classifieds/BrowseFilterViews";
import { GenericBrowseFilters } from "../../../src/components/classifieds/GenericBrowseFilters";
import { ResponsiveBrowseFilters } from "../../../src/components/classifieds/ResponsiveBrowseFilters";
import { BluebirdEmptyState } from "../../../src/components/layout/BluebirdEmptyState";

type Results = MobileBrowse & { total: number; page: number; pageSize: number };
export function NativeBrowse({
  active,
  bootstrap,
  learning,
  revision,
  onNavigate,
  onSave,
}: {
  active: boolean;
  bootstrap: Bootstrap;
  learning: boolean;
  revision: number;
  onNavigate: (path: string) => void;
  onSave: (search: Record<string, unknown>, id?: string) => void;
}) {
  const [location, setLocation] = useState(() => browseLocation(window.location.hash));
  const [result, setResult] = useState<Results | null>(null),
    [items, setItems] = useState<MobileListing[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(location.search.q ?? "");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const preview = useRef<{ timer?: ReturnType<typeof setTimeout>; controller?: AbortController }>(
    {},
  );
  const loaded = useRef<{ key: string; revision: number; retry: number; at: number } | null>(null);
  const scroll = useRef(0),
    loadingMore = useRef<{ scope: string; controller: AbortController } | null>(null);
  const search = location.search;
  const key = location.params.toString();
  useEffect(() => {
    const change = () => {
      const next = browseLocation(window.location.hash);
      if (next.path === "/search") {
        setLocation(next);
        setQuery(next.search.q ?? "");
      }
    };
    window.addEventListener("hashchange", change);
    change();
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!active) return;
    const restoreTo = scroll.current;
    let restoring = true;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, restoreTo);
      restoring = false;
    });
    const remember = () => {
      // The outer navigator resets scroll during hash changes; don't record that
      // reset as the member's previous result position before restoration runs.
      if (!restoring && window.location.hash.startsWith("#/search"))
        scroll.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    if (
      loaded.current?.key === key &&
      loaded.current.revision === revision &&
      loaded.current.retry === retry &&
      Date.now() - loaded.current.at < 60000
    ) {
      setBusy(false);
      return () => {
        loadingMore.current?.controller.abort();
        loadingMore.current = null;
      };
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    if (loaded.current?.key !== key) {
      loaded.current = null;
      setResult(null);
      setItems([]);
    }
    loadingMore.current = null;
    if (!location.eligible) {
      setBusy(false);
      setError("This category is unavailable in the app.");
      return;
    }
    if (!bootstrap.features.fullSearch) {
      setBusy(false);
      setError("Search is temporarily unavailable. Please retry shortly.");
      return;
    }
    void api<Results>(
      `search?${browseApiQuery(location.params)}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        loaded.current = { key, revision, retry, at: Date.now() };
        setResult(data);
        setItems(data.items);
        if (learning) trackShopping("search", undefined, {}, location.raw);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Search could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      loadingMore.current?.controller.abort();
      loadingMore.current = null;
    };
  }, [active, key, revision, retry, bootstrap.features.fullSearch, location.eligible]);
  useEffect(
    () => () => {
      clearTimeout(preview.current.timer);
      preview.current.controller?.abort();
    },
    [],
  );
  const apply = useCallback(
    (patch: Partial<Search>) => {
      if (
        isInvertedRange(patch.priceMin, patch.priceMax) ||
        isInvertedRange(patch.yearMin, patch.yearMax) ||
        isInvertedRange(patch.jobPayMin, patch.jobPayMax)
      ) {
        toast.error("Minimum cannot exceed maximum.");
        return;
      }
      scroll.current = 0;
      onNavigate(browseDestination(patch, location.params));
    },
    [key, onNavigate],
  );
  const clear = () => {
    const category = search.category,
      group = search.group;
    scroll.current = 0;
    onNavigate(
      browseDestination({
        category,
        group,
        homeTab: search.homeTab,
        homeMode: "results",
        vehicleMode: "results",
        jobMode: "results",
        serviceMode: "results",
        petMode: "results",
        savedSearchId: search.savedSearchId,
      }),
    );
  };
  const save = (patch: Partial<Search> = {}) => {
    const destination = browseDestination(patch, location.params);
    const raw = browseLocation("#" + destination).raw;
    if (search.category === "other-real-estate") raw.homeMode = "results";
    if (search.category === "jobs") raw.jobMode = "results";
    if (search.category === "services") raw.serviceMode = "results";
    if (search.category === "pets") raw.petMode = "results";
    if (isMotorsCategory(search.category) || search.group === "motors") raw.vehicleMode = "results";
    delete raw.savedSearchId;
    delete raw.mobileCatalog;
    delete raw.page;
    delete raw.view;
    onSave(raw, search.savedSearchId);
  };
  const loadPreview = useCallback(
    async (pending: Search, signal: AbortSignal) => {
      if (!bootstrap.features.fullSearch) throw Error("Search is temporarily unavailable.");
      // Use the complete raw URL as the base, retaining conditions unknown to this client.
      const params = browseLocation("#" + browseDestination(pending, location.params)).params;
      return api<{ total: number }>(
        `search?${browseApiQuery(params, 1)}`,
        "GET",
        undefined,
        signal,
      );
    },
    [key],
  );
  const previewForm = (form: HTMLFormElement) => {
    clearTimeout(preview.current.timer);
    preview.current.controller?.abort();
    const controller = new AbortController();
    preview.current.controller = controller;
    const pending = { ...search, ...browseSearchPatchFromForm(search, form) };
    preview.current.timer = setTimeout(() => {
      void loadPreview(pending, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setPreviewCount(data.total);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPreviewCount(null);
        });
    }, 250);
  };
  const summaries = useMemo(() => items.map(listingPresentation), [items]);
  const cardsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const renderListing = (
    listing: (typeof summaries)[number],
    position: number,
    view: "grid" | "list" = "grid",
  ) => (
    <ListingTile
      view={view}
      card={cardsById.get(listing.id)!}
      position={position}
      placement="browse"
      learning={learning && active}
      onOpen={(id) => onNavigate(`/listings/${id}`)}
    />
  );
  const total = result?.total ?? 0;
  const resultView = {
    listings: summaries,
    total,
    page: result?.page ?? 1,
    pageSize: result?.pageSize ?? 24,
    incomplete: result?.incomplete,
  };
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const onPost = () => onNavigate("/post");
  async function more() {
    if (loadingMore.current?.scope === key || !result?.nextPage) return;
    const request = { scope: key, controller: new AbortController() };
    loadingMore.current = request;
    setBusy(true);
    const expected = key;
    try {
      const next = await api<Results>(
        `search?${browseApiQuery(location.params, result.nextPage)}`,
        "GET",
        undefined,
        request.controller.signal,
      );
      if (
        request.controller.signal.aborted ||
        browseLocation(window.location.hash).params.toString() !== expected
      )
        return;
      setItems((previous) => [
        ...new Map([...previous, ...next.items].map((card) => [card.id, card])).values(),
      ]);
      setResult(next);
    } catch (e) {
      if (
        !request.controller.signal.aborted &&
        browseLocation(window.location.hash).params.toString() === expected
      )
        setError(e instanceof Error ? e.message : "Could not load more listings.");
    } finally {
      if (loadingMore.current === request) {
        loadingMore.current = null;
        if (browseLocation(window.location.hash).params.toString() === expected) setBusy(false);
      }
    }
  }
  const homes = search.category === "other-real-estate",
    pets = search.category === "pets";
  const scope = (patch: Partial<Search>): Search => {
    const next = browseLocation("#" + browseDestination(patch, location.params));
    return {
      ...next.raw,
      ...Object.fromEntries(Object.entries(next.search).filter(([, value]) => value !== undefined)),
    } as Search;
  };
  const clearScope = (): Search => ({
    category: search.category,
    group: search.group,
    homeTab: search.homeTab,
    savedSearchId: search.savedSearchId,
    homeMode: "results",
    jobMode: "results",
    serviceMode: "results",
    vehicleMode: "results",
    petMode: "results",
  });
  if (!active) return null;
  if (!location.eligible)
    return (
      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
        <div role="alert" className="error">
          This category is unavailable in the app.
        </div>
        <a
          href="#/search"
          className="inline-flex h-11 items-center rounded-full border border-input px-5 text-sm font-semibold"
        >
          Browse available listings
        </a>
      </section>
    );
  return (
    <section aria-label="Browse listings" className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
      <BrowseResultsHeading
        search={search}
        motors={motors}
        homes={homes}
        jobs={search.category === "jobs"}
        services={search.category === "services"}
        pets={pets}
        firearms={false}
        serviceLanding={false}
        showGenericBrowse={!motors}
        allCategoriesLanding={false}
        heading={
          bootstrap.categories.find((c) => c.slug === search.category)?.name ?? "All classifieds"
        }
        term={query}
        setTerm={setQuery}
        scopedWithoutVehicleFilters={(patch) => ({
          ...scope({
            ...Object.fromEntries(
              [...vehicleSearchKeys, ...firearmSearchKeys, "sellerType"].map((key) => [
                key,
                undefined,
              ]),
            ),
            ...patch,
          }),
        })}
        onApply={apply}
        categories={bootstrap.categories}
        renderLink={NativeBrowseLink}
      />
      {error && (
        <div className="error mt-4" role="alert">
          {error}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
          <button type="button" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
      {result?.incomplete && (
        <p className="muted mt-4" role="status">
          Showing available matching listings. Some sources or results are incomplete; the result
          count may include unavailable matches.
        </p>
      )}
      {motors ? (
        <VehicleResultsPage
          search={search}
          result={resultView}
          renderListing={renderListing}
          loadPreview={loadPreview}
          onApply={apply}
          onClear={clear}
          onSave={save}
          onSell={onPost}
        />
      ) : search.category === "jobs" ? (
        <JobsFilterPage
          search={search}
          listings={summaries}
          total={total}
          renderListing={renderListing}
          onApply={apply}
          onClear={clear}
          onSave={save}
          onPost={onPost}
        />
      ) : search.category === "services" ? (
        <ServicesFilterPage
          search={search}
          listings={summaries}
          total={total}
          renderListing={renderListing}
          onApply={apply}
          onClear={clear}
          onSave={save}
          onPost={onPost}
        />
      ) : (
        <BrowseResultsView
          search={search}
          motors={false}
          homes={homes}
          homeLanding={false}
          pets={pets}
          firearms={false}
          result={resultView}
          shownListings={summaries}
          activeFilterCount={countActiveFilters(search, false, pets, false)}
          filterLabels={activeFilterLabels(search, false, pets, false)}
          searchKey={key}
          homeFilters={
            <HomesFilterPage
              activeTab={search.homeTab ?? "buy"}
              search={search}
              resultCount={total}
              onClear={clear}
              onTabChange={(homeTab) => apply({ homeTab })}
              onApply={apply}
              onSave={save}
            />
          }
          genericFilters={
            <GenericBrowseFilters
              search={search}
              result={{ total }}
              categories={bootstrap.categories}
              onSubmit={(e) => {
                e.preventDefault();
                apply(browseSearchPatchFromForm(search, e.currentTarget));
              }}
              onPreview={previewForm}
              onSave={(form) => save(browseSearchPatchFromForm(search, form))}
              onClear={clear}
              pendingFilterResultCount={previewCount}
            />
          }
          scoped={scope}
          clearFilters={clear}
          clearSearch={clearScope}
          requestSaveSearch={() => save()}
          onApply={apply}
          noResultsHint={
            pets
              ? "Try widening the animal, breed, placement type, location, or price filters."
              : homes
                ? "Try widening the price, location, property type, or bedroom filters."
                : "Try widening the category, price, condition, location, or search terms."
          }
          canLoadMore={Boolean(result?.nextPage)}
          loadedThroughPage={result?.page ?? 1}
          loadingMore={busy}
          loadMore={more}
          page={search.page ?? 1}
          alertSubject={
            search.q
              ? "“" + search.q + "”"
              : (bootstrap.categories.find((c) => c.slug === search.category)?.name.toLowerCase() ??
                "listings")
          }
          alertPlace={search.city ? " near " + search.city : ""}
          renderLink={NativeBrowseLink}
          renderListing={renderListing}
        />
      )}
      {busy && (
        <p role="status" className="mt-4 text-sm">
          Loading listings…
        </p>
      )}
      {(motors || search.category === "jobs" || search.category === "services") &&
        result?.nextPage && (
          <button
            type="button"
            className="btn-outline mt-6"
            disabled={busy}
            onClick={() => void more()}
          >
            Load more
          </button>
        )}
    </section>
  );
}

function NativeBrowseLink({ search, children, to: _to, ...props }: BrowseLinkProps) {
  return (
    <a {...props} href={"#" + browseDestination(search ?? {})}>
      {children}
    </a>
  );
}

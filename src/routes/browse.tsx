import { FirearmsConsentDialog } from "@/components/FirearmsConsentDialog";
import {
  HomesFilterPage,
  InlineApplyButton,
  InlineLocationFilter,
  JobSelect,
  JobsFilterPage,
  ServiceCategory,
  ServicesFilterPage,
  VehicleCheckboxList,
  VehicleFilterOption,
  VehicleResultsPage,
  VehicleSingleSelectList,
  allServiceCategories,
  homeTabs,
  jobCategoryOptions,
  jobPayTypeOptions,
  mileageBandOptions,
  modelsForMakes,
  splitVehicleFilter,
  vehicleConditionOptions,
} from "@/components/classifieds/BrowseFilterViews";
import { BrowseResultsHeading } from "@/components/classifieds/BrowseResultsHeading";
import {
  BrowseResultsView,
  type BrowseLinkProps,
} from "@/components/classifieds/BrowseResultsView";
import { GenericBrowseFilters } from "@/components/classifieds/GenericBrowseFilters";
import { LocationOptions } from "@/components/classifieds/LocationOptions";
import {
  classifiedShowcaseRows,
  firearmShowcaseRows,
  jobsShowcaseRows,
  petShowcaseRows,
  vehicleShowcaseRows,
} from "@/config/landing-preview-rows";
import { activeFilterLabels, countActiveFilters } from "@/lib/browse-filter-labels";
import { browseSearchPatchFromForm } from "@/lib/browse-form";
import {
  inputFromSearch,
  latestListingsInput,
  parseBrowseSearch,
  savedSearchFilterKeys,
  type HomeTab,
  type Search,
} from "@/lib/browse-search";
import { selectDiscoveryCards } from "@/lib/discovery-ranking";
import { homeRowFilters } from "@/lib/landing-home-filters";
import { mixPetSpecies } from "@/lib/pet-mix";
import { shoppingTrack } from "@/lib/shopping-client";
import {
  ArrowRight,
  CaretDown,
  FunnelSimple,
  MagnifyingGlass,
  MapPin,
  Megaphone,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { AllCategoriesPopover } from "@/components/classifieds/AllCategoriesPopover";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { ListingCard, ListingRow, LogoDevCredit } from "@/components/classifieds/ListingCard";
import { SavedSearchNameDialog } from "@/components/classifieds/SavedSearchNameDialog";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brand } from "@/config/brand";
import {
  firearmAccessoryTypes,
  firearmBrands,
  firearmListingTypes,
  firearmTypes,
} from "@/config/classified-item-fields";
import { classifiedCategories, vehicleOptions } from "@/config/classifieds";
import { servicesShowcaseRows } from "@/config/landing-service-rows";
import { createSavedSearch, updateSavedSearch } from "@/lib/account-center.functions";
import { traceMutation, trackEvent } from "@/lib/analytics";
import { isMotorsCategory } from "@/lib/classifieds-display";
import { appendBrowseListings, assertNextBrowsePage } from "@/lib/classifieds-pagination";
import { isInvertedRange, optionalNonNegativeNumber } from "@/lib/classifieds-query";
import {
  browseClassifieds,
  getClassifiedsLandingHome,
  getPetLandingInventory,
  type ClassifiedBrowseInput,
  type ClassifiedBrowseResult,
  type ClassifiedCard,
} from "@/lib/classifieds.functions";
import { landingCards } from "@/lib/landing-card-pool";
import type { ListingCardSummary } from "@/lib/listing-card-summary";
import { varietyOfPets } from "@/lib/pet-showcase";
import { isIndexableCollection, isOutOfRangePage } from "@/lib/seo-policy";
import { getServiceTradeCounts } from "@/lib/service-directory.functions";
import { toast } from "sonner";

type VehicleHeroFilter =
  | "makeModel"
  | "year"
  | "price"
  | "mileage"
  | "bodyStyle"
  | "titleStatus"
  | "location"
  | "condition"
  | "fulfillment"
  | "drivetrain"
  | "transmission"
  | "fuelType"
  | "exteriorColor";
const homeAmenitiesOptions = [
  "Any",
  "Air Conditioning",
  "Attached Garage",
  "Balcony",
  "Carpet",
  "Ceiling Fan(s)",
  "Crown Molding",
  "Controlled Access",
  "Deck",
  "Dishwasher",
  "Energy Efficient",
  "Fireplace",
  "Furnished",
  "Handicap Accessible",
  "Hardwood Flooring",
  "Heating",
  "High ceilings",
  "Internet Ready",
  "New Paint",
  "Newly Remodeled",
  "Parking",
];
const communityAmenitiesOptions = [
  "Any",
  "BBQ Area(s)",
  "Basketball Court",
  "Bike Lockers/Storage",
  "Bluetooth Enabled Spaces",
  "Business Center",
  "Clubhouse",
  "Community Garden",
  "Dog Park",
  "Elevator Access",
  "Fenced Yard",
  "Parcel Lockers",
  "Pet Washing Station",
  "Pickleball",
  "Playground",
  "Pool",
  "Public Transit Nearby",
  "Splash Pad",
  "Storage",
  "Tennis",
  "Theater Room",
  "Volleyball",
  "WiFi in Common Areas",
];

type HomePreviewRow = {
  title: string;
  action: string;
  cards: { name: string; location: string; price: string; facts: string; image: string }[];
};

const homePreviewRows: HomePreviewRow[] = [
  {
    title: "Featured homes for sale",
    action: "Browse homes for sale",
    cards: [],
  },
  {
    title: "New builds to explore",
    action: "Find new construction",
    cards: [],
  },
  {
    title: "Rentals worth a look",
    action: "Browse rentals",
    cards: [],
  },
];

const homePreviewRowsByTab: Record<HomeTab, HomePreviewRow[]> = {
  buy: [
    homePreviewRows[0]!,
    {
      title: "Price drops to watch",
      action: "See price drops",
      cards: [],
    },
    showcaseRow(
      "Starter homes",
      "Browse starter homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
    showcaseRow(
      "Condos & townhomes",
      "Browse attached homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
    showcaseRow(
      "Homes with space to grow",
      "Find larger homes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=buy",
      [],
    ),
  ],
  build: [
    homePreviewRows[1]!,
    {
      title: "Quick move-in homes",
      action: "Find move-in ready builds",
      cards: [],
    },
    showcaseRow(
      "New build communities",
      "Explore communities",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
    showcaseRow(
      "Custom build opportunities",
      "Plan a custom home",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
    showcaseRow(
      "Townhome builds",
      "Find new townhomes",
      "/browse?category=other-real-estate&homeMode=results&homeTab=build",
      [],
    ),
  ],
  rent: [
    homePreviewRows[2]!,
    {
      title: "Pet-friendly rentals",
      action: "Browse pet-friendly homes",
      cards: [],
    },
    showcaseRow(
      "Apartments under $1,800",
      "Browse budget-friendly rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
    showcaseRow(
      "Rentals with room to spread out",
      "Find larger rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
    showcaseRow(
      "Short-term & flexible stays",
      "Explore flexible rentals",
      "/browse?category=other-real-estate&homeMode=results&homeTab=rent",
      [],
    ),
  ],
};

const serviceCategoryRows: { title: string; categories: ServiceCategory[] }[] = [
  {
    title: "Popular services",
    categories: [
      {
        name: "Drywall",
        image:
          "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Electricians",
        image:
          "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Handyman",
        image:
          "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Heating & Air Conditioning",
        image:
          "https://images.unsplash.com/photo-1631545806609-ccf5d6f5c2ab?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Movers",
        image:
          "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Painters",
        image:
          "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80",
      },
    ],
  },
  {
    title: "Seasonal categories",
    categories: [
      {
        name: "Lawn Care & Maintenance",
        image:
          "https://images.unsplash.com/photo-1599685315640-3f3c8e3d9b4b?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Landscape Contractors",
        image:
          "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "House Cleaning",
        image:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Cabinet & Countertops",
        image:
          "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Carpet & Flooring Installation",
        image:
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=700&q=80",
      },
      {
        name: "Automotive",
        image:
          "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=700&q=80",
      },
    ],
  },
];

const landingHomeQuery = queryOptions({
  queryKey: ["classifieds-landing-cache"],
  staleTime: (query) => (query.state.data ? 60_000 : 5_000),
  retry: false,
  // The primary query remains authoritative. If the optional wider cache is
  // temporarily unavailable, curate from its real results rather than fail
  // an otherwise healthy category page or start a search for every row.
  queryFn: () => getClassifiedsLandingHome().catch(() => null),
});

const petLandingQuery = queryOptions({
  queryKey: ["pet-landing-inventory"],
  staleTime: 60_000,
  queryFn: () => getPetLandingInventory(),
});

function isLandingPage(search: Search) {
  if ((search.page ?? 1) !== 1) return false;
  if (search.allCategories) return true;
  if (search.group === "motors" || isMotorsCategory(search.category))
    return search.vehicleMode !== "results";
  const mode = (
    {
      "other-real-estate": search.homeMode,
      jobs: search.jobMode,
      services: search.serviceMode,
      pets: search.petMode,
      firearms: search.firearmMode,
    } as Record<string, string | undefined>
  )[search.category ?? ""];
  return (
    ["other-real-estate", "jobs", "services", "pets", "firearms"].includes(search.category ?? "") &&
    mode !== "results"
  );
}

const classifiedQuery = (input: ClassifiedBrowseInput) =>
  queryOptions({
    staleTime: 60_000,
    queryKey: ["classified-browse", input],
    queryFn: () =>
      traceMutation(
        {
          flow: "classified_search",
          props: { category: input.category ?? "all", group: input.group ?? "all" },
          thresholdMs: 1_000,
        },
        () => browseClassifieds({ data: input }),
      ),
  });

function browseHeadHeading(search: Search) {
  const category = classifiedCategories.find((option) => option.slug === search.category);
  if (category?.slug === "jobs") return "Local jobs";
  if (category?.slug === "services") return "Local services";
  if (category?.slug === "other-real-estate")
    return search.homeTab === "rent"
      ? "Homes for rent"
      : search.homeTab === "build"
        ? "New construction homes"
        : "Homes for sale and rent";
  if (category?.slug === "pets") return "Pets";
  if (category) return `${category.name} for sale`;
  if (search.group === "motors") return "Vehicles for sale";
  return null;
}

export const Route = createFileRoute("/browse")({
  validateSearch: parseBrowseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const [result] = await Promise.all([
      context.queryClient.ensureQueryData(classifiedQuery(latestListingsInput(deps))),
      isLandingPage(deps) ? context.queryClient.ensureQueryData(landingHomeQuery) : undefined,
      deps.category === "pets" && isLandingPage(deps)
        ? context.queryClient.ensureQueryData(petLandingQuery)
        : undefined,
    ]);
    if (isOutOfRangePage(deps.page ?? 1, result.total, result.pageSize)) throw notFound();
    return { total: result.total };
  },
  head: ({ match, loaderData }) => {
    const search = match.search as Search;
    const heading = browseHeadHeading(search);
    const title = heading
      ? `${heading} — ${brand.name}`
      : `Browse local classifieds — ${brand.name}`;
    const description = heading
      ? `${heading}: browse listings from sellers across Idaho, Utah, Oregon, and Washington and contact them directly on ${brand.name}.`
      : "Search local classifieds across Idaho, Utah, Oregon, and Washington by category, city, distance, price, and condition.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // Category pages are indexable; keyword searches, filter combinations
        // and saved-search views are not (followed, never indexed).
        ...(isIndexableCollection(search, loaderData?.total ?? 0)
          ? []
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Browse,
  errorComponent: BrowseLoadError,
});

function BrowseLoadError({ reset }: { reset: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
      <BluebirdEmptyState
        title="The classifieds did not load"
        description="The connection dropped before the listings finished loading. Nothing was lost — try again."
      >
        <button
          type="button"
          onClick={() => {
            void queryClient.resetQueries({ queryKey: ["classified-browse"] }).then(() => {
              reset();
              void router.invalidate();
            });
          }}
          className="inline-flex h-10 items-center rounded-md border border-input px-4 text-[13px] font-semibold hover:bg-secondary"
        >
          Retry
        </button>
      </BluebirdEmptyState>
    </main>
  );
}

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: result } = useSuspenseQuery(classifiedQuery(latestListingsInput(search)));
  const [term, setTerm] = useState(search.q ?? "");
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchPending, setSaveSearchPending] = useState(false);
  const [pendingSaveSearch, setPendingSaveSearch] = useState<Record<string, unknown> | null>(null);
  const [pendingFilterResultCount, setPendingFilterResultCount] = useState<number | null>(null);
  const [isClearingFilters, setIsClearingFilters] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);
  const saveSearch = useServerFn(createSavedSearch);
  const updateSearch = useServerFn(updateSavedSearch);

  useEffect(() => setTerm(search.q ?? ""), [search.q]);

  useEffect(() => {
    void trackEvent("page_view", { route: "/browse" });
  }, []);

  useEffect(() => {
    shoppingTrack("search", undefined, {}, search as unknown as Record<string, unknown>);
    if (!search.q) return;
    void trackEvent(result.total === 0 ? "search_no_results" : "search_performed", {
      term_length: search.q.length,
      results: result.total,
      category: search.category ?? "all",
      region: search.region ?? "all",
    });
    void trackEvent("search_completed", {
      results: result.total,
      category: search.category ?? "all",
      region: search.region ?? "all",
    });
  }, [JSON.stringify(search), result.total]);

  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({
        ...search,
        ...patch,
        page: undefined,
        ...(Object.prototype.hasOwnProperty.call(patch, "category") &&
        patch.category !== search.category
          ? { itemDetailKey: undefined, itemDetailValue: undefined }
          : {}),
      }).filter(([, value]) => value !== undefined && value !== ""),
    ) as Search;

  const clearSearch = (): Search => {
    const preservedKeys: (keyof Search)[] = [
      "allCategories",
      "category",
      "group",
      "homeMode",
      "homeTab",
      "jobMode",
      "serviceMode",
      "vehicleMode",
      "petMode",
      "firearmMode",
      "view",
    ];
    return Object.fromEntries(
      preservedKeys.flatMap((key) => {
        const value = search[key];
        return value !== undefined && value !== "" && value !== false ? [[key, value]] : [];
      }),
    ) as Search;
  };

  async function clearFilters() {
    if (isClearingFilters) return;
    setIsClearingFilters(true);
    try {
      await navigate({ to: "/browse", search: clearSearch() });
    } finally {
      setIsClearingFilters(false);
    }
  }

  const scopedWithoutVehicleFilters = (patch: Partial<Search>): Search =>
    scoped({
      make: undefined,
      model: undefined,
      yearMin: undefined,
      yearMax: undefined,
      mileageMax: undefined,
      mileageBands: undefined,
      bodyStyle: undefined,
      transmission: undefined,
      drivetrain: undefined,
      fuelType: undefined,
      exteriorColor: undefined,
      titleStatus: undefined,
      sellerType: undefined,
      firearmMode: undefined,
      firearmListingType: undefined,
      firearmType: undefined,
      firearmBrand: undefined,
      firearmAccessoryType: undefined,
      ...patch,
    });

  const selectedCategory = classifiedCategories.find(
    (category) => category.slug === search.category,
  );
  const allCategoriesLanding = search.allCategories === true && (search.page ?? 1) === 1;
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const homes = search.category === "other-real-estate";
  const jobs = search.category === "jobs";
  const services = search.category === "services";
  const pets = search.category === "pets";
  const firearms = search.category === "firearms";
  const vehicleLanding = motors && search.vehicleMode !== "results";
  const petLanding = pets && search.petMode !== "results";
  const firearmLanding = firearms && search.firearmMode !== "results";
  const showGenericBrowse =
    !allCategoriesLanding &&
    (!motors || vehicleLanding) &&
    (!pets || !petLanding) &&
    !firearmLanding;
  const homeTab: HomeTab = search.homeTab ?? "buy";
  const homeLanding = homes && search.homeMode !== "results";
  const jobLanding = jobs && search.jobMode !== "results";
  const serviceLanding = services && search.serviceMode !== "results";
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  // "Load more" appends the following pages under the current one instead
  // of making shoppers page back and forth. Reset whenever the search changes.
  const queryClient = useQueryClient();
  const searchKey = JSON.stringify({ ...inputFromSearch(search), page: undefined });
  const [extraListings, setExtraListings] = useState<typeof result.listings>([]);
  const [loadedThroughPage, setLoadedThroughPage] = useState(page);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreScope = JSON.stringify([searchKey, page]);
  const currentLoadMoreScope = useRef(loadMoreScope);
  currentLoadMoreScope.current = loadMoreScope;
  const loadMoreRequest = useRef<{ scope: string } | null>(null);
  useEffect(() => {
    setExtraListings([]);
    setLoadedThroughPage(page);
    setLoadingMore(false);
    loadMoreRequest.current = null;
    return () => {
      loadMoreRequest.current = null;
    };
  }, [searchKey, page]);
  const shownListings = [...result.listings, ...extraListings];
  const canLoadMore = loadedThroughPage < pageCount;
  async function loadMore() {
    // React state updates are asynchronous; a ref also blocks rapid double clicks.
    if (loadMoreRequest.current || !canLoadMore) return;
    const request = { scope: loadMoreScope };
    loadMoreRequest.current = request;
    setLoadingMore(true);
    try {
      const next = await queryClient.fetchQuery(
        classifiedQuery({ ...inputFromSearch(search), page: loadedThroughPage + 1 }),
      );
      if (loadMoreRequest.current !== request || currentLoadMoreScope.current !== request.scope)
        return;
      assertNextBrowsePage(loadedThroughPage, result.pageSize, next);
      setExtraListings((current) => appendBrowseListings(result.listings, current, next.listings));
      setLoadedThroughPage(next.page);
    } catch {
      if (loadMoreRequest.current === request && currentLoadMoreScope.current === request.scope)
        toast.error("Could not load more listings.");
    } finally {
      if (loadMoreRequest.current === request) {
        loadMoreRequest.current = null;
        if (currentLoadMoreScope.current === request.scope) setLoadingMore(false);
      }
    }
  }
  const alertSubject = search.q
    ? `“${search.q}”`
    : (selectedCategory?.name.toLowerCase() ?? (motors ? "vehicles" : "listings"));
  const alertPlace = search.city ? ` near ${search.city}` : "";
  const activeFilterCount = countActiveFilters(search, motors, pets, firearms);
  const heading =
    selectedCategory?.name ?? (search.group === "motors" ? "Vehicles" : "All classifieds");
  const noResultsHint = pets
    ? "Try widening the animal, breed, placement type, location, or price filters."
    : homes
      ? "Try widening the price, location, property type, or bedroom filters."
      : jobs
        ? "Try widening the job type, pay range, experience, location, or search terms."
        : services
          ? "Try widening the service type, price, location, availability, or search terms."
          : firearms
            ? "Try widening the firearm type, brand, accessory, price, location, or search terms."
            : motors
              ? "Try widening the year, price, mileage, location, or vehicle filters."
              : "Try widening the category, price, condition, location, or search terms.";

  if (isClearingFilters) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
        <div
          role="status"
          aria-live="polite"
          className="floating-card flex min-h-32 items-center justify-center px-5 text-[13px] text-muted-foreground"
        >
          Updating results…
        </div>
      </main>
    );
  }
  function searchPatchFromForm(form: HTMLFormElement) {
    return browseSearchPatchFromForm(search, form);
  }

  function previewFilterResults(form: HTMLFormElement) {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      const requestId = ++previewRequest.current;
      const previewSearch = scoped(searchPatchFromForm(form));
      void browseClassifieds({ data: inputFromSearch(previewSearch) }).then((preview) => {
        if (requestId === previewRequest.current) setPendingFilterResultCount(preview.total);
      });
    }, 250);
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = searchPatchFromForm(event.currentTarget);

    const ranges: [number | undefined, number | undefined, string][] = [
      [patch.priceMin, patch.priceMax, "Price"],
      [patch.yearMin, patch.yearMax, "Year"],
      [patch.jobPayMin, patch.jobPayMax, "Pay"],
    ];
    const invalidRange = ranges.find(([min, max]) => isInvertedRange(min, max));
    if (invalidRange) {
      toast.error(`${invalidRange[2]} minimum cannot exceed maximum.`);
      return;
    }

    void navigate({
      to: "/browse",
      search: scoped(patch),
    });
    setPendingFilterResultCount(null);
  }

  function currentSearchFilters(source: Search = search) {
    return Object.fromEntries(
      savedSearchFilterKeys.flatMap((key) => {
        const value = source[key];
        return value !== undefined && value !== "" ? [[key, value]] : [];
      }),
    );
  }

  function requestSaveSearch(patch: Partial<Search> = {}) {
    const nextSearch = scoped(patch);
    const searchToSave = currentSearchFilters(nextSearch);
    if (search.savedSearchId) {
      void saveCurrentSearch(searchToSave);
      return;
    }
    const suggestedName =
      [selectedCategory?.name, nextSearch.q].filter(Boolean).join(" · ") || "My marketplace search";
    setPendingSaveSearch(searchToSave);
    setSaveSearchName(suggestedName);
    setSaveSearchDialogOpen(true);
  }

  async function saveCurrentSearch(searchToSave = pendingSaveSearch ?? currentSearchFilters()) {
    try {
      if (search.savedSearchId) {
        await updateSearch({ data: { id: search.savedSearchId, search: searchToSave } });
        toast.success("Saved search updated.");
      } else {
        const name = saveSearchName.trim();
        if (!name) return;
        setSaveSearchPending(true);
        await saveSearch({ data: { name, search: searchToSave } });
        setSaveSearchDialogOpen(false);
        setPendingSaveSearch(null);
        toast.success("Saved search created.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in to save this search.");
    } finally {
      setSaveSearchPending(false);
    }
  }

  const genericFilters = (
    <GenericBrowseFilters
      search={search}
      result={result}
      onSubmit={applyFilters}
      onPreview={previewFilterResults}
      onSave={(form) => requestSaveSearch(searchPatchFromForm(form))}
      onClear={clearFilters}
      pendingFilterResultCount={pendingFilterResultCount}
      renderFirearmFilters={<FirearmFilterFields search={search} />}
    />
  );
  const homeFilters = homes && !homeLanding && (
    <HomesFilterPage
      activeTab={homeTab}
      search={search}
      resultCount={result.total}
      onClear={clearFilters}
      onTabChange={(tab) =>
        void navigate({
          to: "/browse",
          search: scoped({
            category: "other-real-estate",
            homeTab: tab,
            homeMode: "results",
            homeSquareFeet: undefined,
            homeAcres: undefined,
            homeYearBuilt: undefined,
            homeHeating: undefined,
            homeCooling: undefined,
            homeGarageParking: undefined,
            homeYard: undefined,
            homeSchoolDistrict: undefined,
            homeAvailable: undefined,
            homePetsPolicy: undefined,
            homeSmokingPolicy: undefined,
            leaseLength: undefined,
          }),
        })
      }
      onApply={(patch) =>
        void navigate({
          to: "/browse",
          search: scoped({
            category: "other-real-estate",
            homeTab,
            homeMode: "results",
            ...patch,
          }),
        })
      }
      onSave={(patch) => requestSaveSearch(patch)}
    />
  );

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
      {allCategoriesLanding && (
        <>
          <ClassifiedsLandingHero
            term={term}
            onTermChange={setTerm}
            onSearch={() =>
              void navigate({
                to: "/browse",
                search: scoped({ allCategories: undefined, q: term.trim() || undefined }),
              })
            }
          />
          <GeneralClassifiedShowcase listings={result.listings} search={search} />
          <HomepageShowcaseRows
            topListings={result.listings}
            eyebrow="Bluebird Marketplace Classifieds"
            rows={classifiedShowcaseRows}
            baseSearch={search}
          />
        </>
      )}

      {motors && vehicleLanding && (
        <VehicleBrowseHero
          search={search}
          resultCount={result.total}
          activeFilterCount={activeFilterCount}
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({
              to: "/browse",
              search: scoped({ q: term.trim() || undefined, vehicleMode: "results" }),
            })
          }
          onFilterChange={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {pets && petLanding && (
        <PetsLandingHero
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({
              to: "/browse",
              search: scoped({ petMode: "results", q: term.trim() || undefined }),
            })
          }
          onCategory={(subcategory) =>
            void navigate({
              to: "/browse",
              search: scoped({ petMode: "results", petSubcategory: subcategory }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {pets && petLanding && <PetLandingListings search={search} listings={result.listings} />}

      {firearms && <FirearmsConsentDialog />}
      {firearms && firearmLanding && (
        <FirearmsLandingHero
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({
              to: "/browse",
              search: scoped({ firearmMode: "results", q: term.trim() || undefined }),
            })
          }
          onBrowse={() =>
            void navigate({
              to: "/browse",
              search: scoped({ firearmMode: "results", q: undefined }),
            })
          }
          onCategory={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({
                firearmMode: "results",
                q: undefined,
                firearmListingType: undefined,
                firearmType: undefined,
                firearmBrand: undefined,
                firearmAccessoryType: undefined,
                ...patch,
              }),
            })
          }
        />
      )}

      {firearms && firearmLanding && (
        <>
          <FirearmsSafetyCallout />
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Firearms"
            title="Latest firearm listings"
            action="Browse all firearms"
            browseSearch={{
              category: "firearms",
              firearmMode: "results",
              firearmListingType: "Firearm",
            }}
            listings={varietyOfFirearms(result.listings, 4)}
            mobileCarousel
          />
          <FirearmsCategoryShowcase
            afterTypes={
              <HomepageShowcaseRows
                topListings={result.listings}
                eyebrow="Bluebird Marketplace Firearms"
                rows={firearmShowcaseRows.slice(0, 2)}
                baseSearch={search}
              />
            }
            afterBrands={
              <HomepageShowcaseRows
                topListings={result.listings}
                eyebrow="Bluebird Marketplace Firearms"
                rows={firearmShowcaseRows.slice(2, 4)}
                baseSearch={search}
              />
            }
            onSelect={(patch) =>
              void navigate({
                to: "/browse",
                search: scoped({
                  firearmMode: "results",
                  q: undefined,
                  firearmListingType: undefined,
                  firearmType: undefined,
                  firearmBrand: undefined,
                  firearmAccessoryType: undefined,
                  ...patch,
                }),
              })
            }
          />
          <HomepageShowcaseRows
            topListings={result.listings}
            eyebrow="Bluebird Marketplace Firearms"
            rows={firearmShowcaseRows.slice(4)}
            baseSearch={search}
          />
        </>
      )}

      {motors && vehicleLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Motors"
            title="Latest vehicles"
            action="Browse all vehicles"
            browseSearch={{ group: "motors", vehicleMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows
            topListings={result.listings}
            eyebrow="Bluebird Marketplace Motors"
            rows={vehicleShowcaseRows}
            baseSearch={search}
          />
        </>
      )}

      {motors && !vehicleLanding && (
        <VehicleResultsPage
          renderListing={renderBrowseListing}
          loadPreview={loadVehiclePreview}
          search={search}
          result={result}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({ to: "/browse", search: scoped({ vehicleMode: "results", ...patch }) })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {homeLanding && (
        <HomesLandingHero
          activeTab={homeTab}
          location={search.homeLocation ?? search.q ?? ""}
          resultCount={result.total}
          onTabChange={(tab) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab: tab, homeMode: "landing" }),
            })
          }
          onSearch={(location) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "other-real-estate",
                homeTab,
                homeMode: "results",
                q: location.trim() || undefined,
                homeLocation: location.trim() || undefined,
              }),
            })
          }
          onMoreFilters={() =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab, homeMode: "results" }),
            })
          }
        />
      )}

      {homeLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Homes"
            title={`${homeTab.charAt(0).toUpperCase()}${homeTab.slice(1)} listings`}
            action="Browse all homes"
            browseSearch={{
              category: "other-real-estate",
              homeMode: "results",
              homeTab,
            }}
            listings={result.listings}
          />
          <HomeShowcaseRows activeTab={homeTab} listings={result.listings} search={search} />
        </>
      )}

      {jobs && jobLanding && (
        <JobsLandingHero
          search={search}
          resultCount={result.total}
          onSearch={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onMoreFilters={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {jobs && jobLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Jobs"
            title="Latest local jobs"
            action="Browse all jobs"
            browseSearch={{ category: "jobs", jobMode: "results" }}
            listings={result.listings}
            compact
          />
          <HomepageShowcaseRows
            topListings={result.listings}
            eyebrow="Bluebird Marketplace Jobs"
            rows={jobsShowcaseRows}
            jobSearch={search}
          />
          {/* Partner job credits live on each job's own page; logo.dev's
              free plan asks for one visible link where its logos show. */}
          <p className="mt-12 text-center">
            <LogoDevCredit />
          </p>
        </>
      )}

      {jobs && !jobLanding && (
        <JobsFilterPage
          renderListing={renderBrowseListing}
          search={search}
          listings={result.listings}
          total={result.total}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "jobs", jobMode: "results", ...patch }),
            })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesLandingHero
          resultCount={result.total}
          onSearch={(subcategory) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "services",
                serviceMode: "results",
                q: undefined,
                serviceSubcategory: subcategory || undefined,
              }),
            })
          }
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <>
          <LandingListingsShowcase
            eyebrow="Bluebird Marketplace Services"
            title="Latest local services"
            action="Browse all services"
            browseSearch={{ category: "services", serviceMode: "results" }}
            listings={result.listings}
          />
          <HomepageShowcaseRows
            topListings={result.listings}
            eyebrow="Bluebird Marketplace Services"
            rows={servicesShowcaseRows}
            jobSearch={search}
          />
        </>
      )}

      {services && !serviceLanding && (
        <ServicesFilterPage
          renderListing={renderBrowseListing}
          search={search}
          listings={result.listings}
          total={result.total}
          onClear={clearFilters}
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "services", serviceMode: "results", ...patch }),
            })
          }
          onSave={(patch) => requestSaveSearch(patch)}
          onPost={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {services && serviceLanding && (
        <ServicesCategoryShowcase
          onCategorySelect={(category) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "services",
                serviceMode: "results",
                q: undefined,
                serviceSubcategory: category,
              }),
            })
          }
        />
      )}

      <BrowseResultsHeading
        search={search}
        motors={motors}
        homes={homes}
        jobs={jobs}
        services={services}
        pets={pets}
        firearms={firearms}
        serviceLanding={serviceLanding}
        showGenericBrowse={showGenericBrowse}
        allCategoriesLanding={allCategoriesLanding}
        heading={heading}
        term={term}
        setTerm={setTerm}
        scopedWithoutVehicleFilters={scopedWithoutVehicleFilters}
        onApply={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
        categories={classifiedCategories}
        renderLink={WebsiteBrowseLink}
      />

      {search.category === "firearms" && showGenericBrowse && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck
              size={19}
              weight="fill"
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
              Review Bluebird’s guidance for safe, lawful firearm listings and transactions.
            </p>
          </div>
          <Link
            to="/firearms-safety"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-card px-3.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Firearm safety statement <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      )}

      {!jobs && !services && showGenericBrowse && (
        <BrowseResultsView
          search={search}
          motors={motors}
          homes={homes}
          homeLanding={homeLanding}
          pets={pets}
          firearms={firearms}
          result={result}
          shownListings={shownListings}
          activeFilterCount={activeFilterCount}
          searchKey={searchKey}
          homeFilters={homeFilters}
          genericFilters={genericFilters}
          scoped={scoped}
          clearFilters={clearFilters}
          clearSearch={clearSearch}
          requestSaveSearch={requestSaveSearch}
          noResultsHint={noResultsHint}
          canLoadMore={canLoadMore}
          loadedThroughPage={loadedThroughPage}
          loadingMore={loadingMore}
          loadMore={loadMore}
          page={page}
          alertSubject={alertSubject}
          alertPlace={alertPlace}
          filterLabels={activeFilterLabels(search, motors, pets, firearms)}
          onApply={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
          renderLink={WebsiteBrowseLink}
          renderListing={renderBrowseResultListing}
        />
      )}
      <SavedSearchNameDialog
        open={saveSearchDialogOpen}
        name={saveSearchName}
        mode="create"
        pending={saveSearchPending}
        onOpenChange={(open) => {
          setSaveSearchDialogOpen(open);
          if (!open) setPendingSaveSearch(null);
        }}
        onNameChange={setSaveSearchName}
        onSubmit={() => void saveCurrentSearch()}
      />
    </main>
  );
}

function FirearmsLandingHero({
  term,
  onTermChange,
  onSearch,
  onBrowse,
  onCategory,
}: {
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onBrowse: () => void;
  onCategory: (patch: Partial<Search>) => void;
}) {
  const quickCategories: { label: string; patch: Partial<Search> }[] = [
    { label: "Rifles", patch: { firearmListingType: "Firearm", firearmType: "Rifle" } },
    { label: "Handguns", patch: { firearmListingType: "Firearm", firearmType: "Handgun" } },
    { label: "Shotguns", patch: { firearmListingType: "Firearm", firearmType: "Shotgun" } },
    { label: "Accessories", patch: { firearmListingType: "Accessory" } },
  ];
  return (
    <section
      aria-label="Bluebird Marketplace firearms"
      className="classifieds-hero-shell relative isolate flex flex-col justify-center overflow-hidden rounded-[32px] border border-brand-blue/20 bg-secondary px-4 pb-5 pt-4 shadow-xl sm:px-10 sm:pb-8 sm:pt-[72px] xl:pt-12"
    >
      <span
        className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-blue/12"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-brand-warm/18"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
        aria-hidden="true"
      />
      <div className="relative z-20 mb-4 flex justify-end sm:absolute sm:right-10 sm:top-4 sm:mb-0">
        <SponsoredHeroBadge />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[920px] text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Bluebird Marketplace Firearms
        </p>
        <h1 className="mx-auto mt-2 max-w-[16ch] text-[28px] font-bold leading-[1.05] tracking-tight sm:max-w-none sm:whitespace-nowrap sm:text-[44px]">
          Firearms, gear, and{" "}
          <span className="relative inline-block text-brand-blue">
            everything in between.
            <span
              className="absolute -bottom-2 left-1/4 h-1 w-1/2 rounded-full bg-brand-warm/80 sm:-bottom-3"
              aria-hidden="true"
            />
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-none text-[13px] leading-relaxed text-muted-foreground sm:mt-5 sm:whitespace-nowrap sm:text-[15px]">
          Explore firearms, optics, ammunition, and gear from local sellers and trusted retailers.
        </p>
        <div className="mx-auto mt-5 hidden w-fit sm:flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-9 rounded-full bg-brand-blue" />
          <span className="h-1.5 w-5 rounded-full bg-brand-warm" />
          <span className="h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
        </div>

        <form
          className="mx-auto mt-5 grid max-w-[860px] grid-cols-[minmax(0,1fr)_auto] gap-2 sm:mt-7 sm:flex sm:flex-row rounded-[24px] border border-brand-blue/20 bg-card p-2 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:px-3">
            <MagnifyingGlass size={19} className="shrink-0 text-brand-blue" aria-hidden="true" />
            <span className="sr-only">Search firearm listings</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search firearms"
              aria-label="Search firearm listings"
              className="h-11 w-full min-w-0 flex-1 bg-transparent text-[16px] sm:h-12 sm:text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 sm:h-12 sm:gap-2 sm:px-7 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <MagnifyingGlass size={16} aria-hidden="true" /> Search
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="col-span-2 inline-flex h-10 w-full items-center justify-center sm:h-12 gap-2 rounded-full border border-primary px-6 text-[13px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:w-auto"
              >
                Browse Firearms
                <CaretDown size={15} weight="bold" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={12}
              className="w-[min(340px,calc(100vw-2rem))] rounded-[20px] p-2 shadow-xl"
            >
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={onBrowse}
                  className="col-span-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-secondary"
                >
                  All firearm listings
                </button>
                {quickCategories.map((category) => (
                  <button
                    key={category.label}
                    type="button"
                    onClick={() => onCategory(category.patch)}
                    className="rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-secondary"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </form>
      </div>
    </section>
  );
}

function FirearmsSafetyCallout() {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-3 py-2 sm:mt-5 sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        <ShieldCheck
          size={21}
          weight="fill"
          className="mt-0.5 shrink-0 text-primary max-sm:h-4 max-sm:w-4"
          aria-hidden="true"
        />
        <div>
          <p className="text-[11px] font-semibold text-foreground sm:text-[13px]">
            Buy and sell responsibly
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-[12px] sm:leading-relaxed">
            Review Bluebird’s guidance for safe, lawful firearm listings and private transactions.
          </p>
        </div>
      </div>
      <Link
        to="/firearms-safety"
        className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border border-primary/40 bg-card px-2.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:h-9 sm:gap-1.5 sm:px-3.5 sm:text-[12px]"
      >
        Firearm safety statement{" "}
        <ArrowRight size={14} weight="bold" aria-hidden="true" className="max-sm:h-3 max-sm:w-3" />
      </Link>
    </div>
  );
}

function FirearmsCategoryShowcase({
  onSelect,
  afterTypes,
  afterBrands,
}: {
  onSelect: (patch: Partial<Search>) => void;
  afterTypes?: React.ReactNode;
  afterBrands?: React.ReactNode;
}) {
  const popularBrands = [
    "Browning",
    "Glock",
    "Henry",
    "Mossberg",
    "Remington",
    "Ruger",
    "Savage Arms",
    "SIG Sauer",
    "Smith & Wesson",
    "Springfield Armory",
    "Weatherby",
    "Winchester",
  ];

  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      <FirearmBrowseSection title="Browse by firearm type">
        {firearmTypes.map((type) => (
          <FirearmBrowseButton
            key={type}
            label={type}
            onClick={() => onSelect({ firearmListingType: "Firearm", firearmType: type })}
          />
        ))}
      </FirearmBrowseSection>

      {afterTypes}

      <FirearmBrowseSection title="Shop popular brands">
        {popularBrands.map((brandName) => (
          <FirearmBrowseButton
            key={brandName}
            label={brandName}
            onClick={() => onSelect({ firearmBrand: brandName })}
          />
        ))}
      </FirearmBrowseSection>

      {afterBrands}

      <FirearmBrowseSection title="Firearm accessories">
        {firearmAccessoryTypes.map((type) => (
          <FirearmBrowseButton
            key={type}
            label={type}
            onClick={() =>
              onSelect({ firearmListingType: "Accessory", firearmAccessoryType: type })
            }
          />
        ))}
      </FirearmBrowseSection>
    </div>
  );
}

function FirearmBrowseSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = title.replaceAll(" ", "-").toLowerCase();
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 border-b border-border pb-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
          Bluebird Marketplace Firearms
        </p>
        <h2 id={id} className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function FirearmBrowseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-11 items-center justify-between gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-[12px] font-semibold shadow-sm transition hover:border-primary hover:text-primary sm:min-h-12 sm:px-4 sm:py-3 sm:text-[13px]"
    >
      <span>{label}</span>
      <ArrowRight
        size={15}
        aria-hidden="true"
        className="shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

function PetsLandingHero({
  term,
  onTermChange,
  onSearch,
  onCategory,
  onPost,
}: {
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onCategory: (subcategory: string) => void;
  onPost: () => void;
}) {
  const [mobileMode, setMobileMode] = useState<"search" | "post">("search");
  const quickCategories = [
    { slug: "dogs", label: "Dogs" },
    { slug: "cats", label: "Cats" },
    { slug: "birds", label: "Birds" },
    { slug: "fish", label: "Fish" },
    { slug: "rabbits", label: "Rabbits" },
    { slug: "reptiles", label: "Reptiles" },
    { slug: "other-pets", label: "Other pets" },
  ];

  return (
    <section
      aria-label="Bluebird Marketplace pets"
      className="classifieds-hero-shell relative isolate flex flex-col justify-start overflow-hidden rounded-[32px] border border-brand-blue/20 bg-secondary px-4 py-5 shadow-xl sm:min-h-[430px] sm:justify-center sm:px-10 sm:pb-12 sm:pt-20"
    >
      <span
        className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-blue/12"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-brand-warm/18"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
        aria-hidden="true"
      />
      <div className="relative z-20 mb-4 flex justify-end sm:absolute sm:right-10 sm:top-6 sm:mb-0">
        <SponsoredHeroBadge />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[920px] text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Bluebird Marketplace Pets
        </p>
        <h1 className="mx-auto mt-2 max-w-[22ch] text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
          Meet your{" "}
          <span className="relative inline-block text-brand-blue">
            new sidekick.
            <span
              className="absolute -bottom-2 left-1/4 h-1 w-1/2 rounded-full bg-brand-warm/80 sm:-bottom-3"
              aria-hidden="true"
            />
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-[42ch] text-[13px] leading-snug text-muted-foreground sm:hidden">
          Pets, supplies, and new beginnings.
        </p>
        <p className="mx-auto mt-4 hidden max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:block">
          Browse local pets, supplies, and rehoming listings with filters for the animal, breed,
          placement type, and seller.
        </p>
        <div className="mx-auto mt-5 hidden w-fit sm:flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-9 rounded-full bg-brand-blue" />
          <span className="h-1.5 w-5 rounded-full bg-brand-warm" />
          <span className="h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
        </div>
        <div
          className="mx-auto mt-4 flex max-w-[860px] rounded-full border border-brand-blue/20 bg-card p-1 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:hidden"
          role="group"
          aria-label="Pet listing actions"
        >
          <button
            type="button"
            aria-pressed={mobileMode === "search"}
            onClick={() => setMobileMode("search")}
            className={`min-h-10 flex-1 rounded-full px-4 text-[12px] font-bold transition ${mobileMode === "search" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
          >
            Search
          </button>
          <button
            type="button"
            aria-pressed={mobileMode === "post"}
            onClick={() => setMobileMode("post")}
            className={`min-h-10 flex-1 rounded-full px-4 text-[12px] font-bold transition ${mobileMode === "post" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
          >
            Post
          </button>
        </div>
        {mobileMode === "search" ? (
          <form
            className="mx-auto mt-2 flex w-full max-w-[860px] gap-2 rounded-[20px] border border-brand-blue/20 bg-card p-1.5 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:hidden"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
          >
            <label className="relative min-w-0 flex-1">
              <MagnifyingGlass
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-blue"
                aria-hidden="true"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => onTermChange(event.target.value)}
                placeholder="Search pets"
                aria-label="Search pets"
                className="h-10 w-full rounded-xl bg-transparent pl-10 pr-2 text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-[12px] font-bold text-primary-foreground"
            >
              Go
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onPost}
            className="mx-auto mt-2 inline-flex h-11 w-full max-w-[860px] items-center justify-center gap-2 rounded-[20px] bg-primary px-5 text-[12px] font-bold text-primary-foreground sm:hidden"
          >
            Post a pet listing <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
        <form
          className="mx-auto mt-7 hidden max-w-[860px] flex-col gap-2 rounded-[24px] border border-brand-blue/20 bg-card p-2 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:flex sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-blue"
              aria-hidden="true"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search dogs, cats, birds, breeders, and more"
              aria-label="Search pets"
              className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <MagnifyingGlass size={17} aria-hidden="true" /> Search pets
          </button>
        </form>
        <div className="mt-5 hidden flex-wrap justify-center gap-2 sm:flex">
          {quickCategories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => onCategory(category.slug)}
              className="rounded-full border border-border bg-card/80 px-3.5 py-2 text-[12px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              {category.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onPost}
          className="mt-6 hidden h-10 items-center gap-2 rounded-full border border-primary px-5 text-[12px] font-semibold text-primary hover:bg-primary/10 sm:inline-flex"
        >
          Post a pet listing <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

const generalCategoryHighlights = [
  { slug: "furniture", name: "Furniture", description: "Home pieces and decor" },
  { slug: "electronics", name: "Electronics", description: "Devices, audio, and gear" },
  { slug: "firearms", name: "Firearms", description: "Rifles, handguns, and range gear" },
  {
    slug: "outdoor-sporting",
    name: "Outdoor & Sporting",
    description: "Gear for your next outing",
  },
  { slug: "farm-garden", name: "Farm & Garden", description: "Yard, farm, and garden" },
  { slug: "pets", name: "Pets", description: "Dogs, cats, and supplies" },
] as const;

type HomepagePreviewCard = {
  title: string;
  location: string;
  price: string;
  detail: string;
  image: string;
};

type HomepagePreviewRow = {
  title: string;
  action: string;
  href: string;
  cards: HomepagePreviewCard[];
};

function previewCard(
  title: string,
  location: string,
  price: string,
  detail: string,
  image: string,
  _badge?: string,
): HomepagePreviewCard & { name: string; facts: string } {
  return {
    title,
    name: title,
    location,
    price,
    detail,
    facts: detail,
    image,
  };
}

function showcaseRow(
  title: string,
  action: string,
  href: string,
  cards: (HomepagePreviewCard & { name: string; facts: string })[],
): HomepagePreviewRow & {
  cards: (HomepagePreviewCard & { name: string; facts: string })[];
} {
  return { title, action, href, cards };
}

// Each row is one trade, filled from members' listings and the services directory.

function ClassifiedsLandingHero({
  term,
  onTermChange,
  onSearch,
}: {
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <section
      aria-label="Bluebird Marketplace all classifieds"
      className="classifieds-hero-shell relative isolate flex flex-col justify-center sm:min-h-[430px] overflow-hidden rounded-[32px] border border-brand-blue/20 bg-secondary px-4 pb-5 pt-4 shadow-xl sm:px-10 sm:pb-12 sm:pt-20"
    >
      <span
        className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-blue/12"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-36 left-1/3 h-80 w-80 rounded-full bg-brand-warm/18"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
        aria-hidden="true"
      />
      <div className="relative z-20 mb-4 flex justify-end sm:absolute sm:right-10 sm:top-6 sm:mb-0">
        <SponsoredHeroBadge />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[920px] text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Bluebird Marketplace Classifieds
        </p>
        <h1 className="mx-auto mt-2 max-w-[22ch] text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
          Good finds.{" "}
          <span className="relative inline-block text-brand-blue">
            Great neighbors.
            <span
              className="absolute -bottom-2 left-1/4 h-1 w-1/2 rounded-full bg-brand-warm/80 sm:-bottom-3"
              aria-hidden="true"
            />
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-[54ch] text-[13px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Local listings. Plenty to discover.
        </p>
        <div className="mx-auto mt-5 hidden w-fit sm:flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-9 rounded-full bg-brand-blue" />
          <span className="h-1.5 w-5 rounded-full bg-brand-warm" />
          <span className="h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
        </div>

        <form
          className="mx-auto mt-5 grid max-w-[860px] grid-cols-[minmax(0,1fr)_auto] gap-2 sm:mt-7 sm:flex sm:flex-row rounded-[24px] border border-brand-blue/20 bg-card p-2 shadow-[0_20px_45px_-28px_rgb(31_53_87_/_55%)] ring-1 ring-brand-warm/10 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:px-3">
            <MagnifyingGlass size={19} className="shrink-0 text-brand-blue" aria-hidden="true" />
            <span className="sr-only">Search classifieds</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search classifieds"
              aria-label="Search classifieds"
              className="h-11 w-full min-w-0 flex-1 bg-transparent text-[16px] sm:h-12 sm:text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 sm:h-12 sm:gap-2 sm:px-7 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <MagnifyingGlass size={17} aria-hidden="true" />
            Search
          </button>
          <AllCategoriesPopover className="col-span-2 w-full sm:w-auto" />
        </form>
      </div>
    </section>
  );
}

function GeneralClassifiedShowcase({
  listings,
  search = {},
}: {
  listings: ClassifiedBrowseResult["listings"];
  search?: Search;
}) {
  const { data: saved } = useSuspenseQuery(landingHomeQuery);
  const generalListings = landingCards(
    [...(saved?.recent ?? []), ...listings],
    inputFromSearch(search),
  ).filter((listing) => !listing.vehicle);
  const sellerCounts = new Map<string, number>();
  const first = selectDiscoveryCards(generalListings, 4, sellerCounts);
  const second = selectDiscoveryCards(
    generalListings,
    4,
    sellerCounts,
    new Set(first.map((card) => card.id)),
  );
  const listingRows = [
    {
      title: "Top listings",
      listings: first,
    },
    {
      title: "Newest listings",
      listings: second,
    },
  ];

  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      <section aria-labelledby="top-general-categories">
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird Marketplace Classifieds
            </p>
            <h2
              id="top-general-categories"
              className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
            >
              Top categories
            </h2>
          </div>
          <AllCategoriesPopover label="Browse all" className="h-10 rounded-full px-4 text-[12px]" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {generalCategoryHighlights.map((category) => (
            <Link
              key={category.slug}
              to="/browse"
              search={{ category: category.slug }}
              className="group rounded-2xl border border-border/70 bg-card px-4 py-5 text-center shadow-sm transition-shadow hover:shadow-lg"
            >
              <span className="mx-auto flex h-16 items-center justify-center">
                <CategoryArtwork slug={category.slug} size={68} className="category-art--nav" />
              </span>
              <span className="mt-2 block text-[13px] font-semibold leading-tight group-hover:text-primary">
                {category.name}
              </span>
              <span className="mt-1 block text-[11px] leading-tight text-muted-foreground">
                {category.description}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {listingRows.map((row, rowIndex) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-")}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                Bluebird Marketplace Classifieds
              </p>
              <h2
                id={row.title.replaceAll(" ", "-")}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={(prev) => ({ ...prev, allCategories: undefined, page: 1 })}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              See all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {row.listings.length === 0 ? (
            <CategoryGettingStarted />
          ) : (
            <ul className="no-scrollbar grid grid-cols-1 gap-4 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-4">
              {row.listings.map((listing, index) => (
                <li key={row.title + "-" + listing.id} className="min-w-0">
                  <ListingCard listing={listing} priority={rowIndex === 0 && index === 0} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function CategoryPreviewEmpty() {
  return (
    <BluebirdEmptyState
      headingLevel="h2"
      title="No matches in this preview."
      description="Use the browse link above to search the full category."
    />
  );
}

function CategoryGettingStarted() {
  return (
    <BluebirdEmptyState
      title="Bluebird is just getting started."
      description="New listings from Idaho sellers show up here as soon as they're posted. Have something to sell? Be one of the first."
    />
  );
}

/**
 * Idaho and different sellers lead each showcase. Distinct titles break ties;
 * repeat sellers fill sparse rows only when alternatives are exhausted.
 */
function varietyOf<T extends { id: string; title: string }>(listings: readonly T[], count: number) {
  const key = (listing: T) =>
    listing.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 4)
      .join(" ");
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const listing of listings) {
    if (seen.has(key(listing))) continue;
    seen.add(key(listing));
    picked.push(listing);
  }
  for (const listing of listings) {
    if (picked.length >= count) break;
    if (!picked.includes(listing)) picked.push(listing);
  }
  return selectDiscoveryCards(
    [...picked, ...listings.filter((card) => !picked.includes(card))],
    count,
  );
}

function varietyOfFirearms(listings: readonly ClassifiedCard[], count: number): ClassifiedCard[] {
  const firearms = listings.filter((listing) => listing.itemDetails?.listingType === "Firearm");
  const seenTypes = new Set<string>();
  const types = firearms.filter((listing) => {
    const type = String(listing.itemDetails?.firearmType ?? "Other firearm");
    if (seenTypes.has(type)) return false;
    seenTypes.add(type);
    return true;
  });
  return varietyOf([...types, ...firearms.filter((card) => !types.includes(card))], count);
}

function PetLandingListings({ search, listings }: { search: Search; listings: ClassifiedCard[] }) {
  const { data: inventory } = useSuspenseQuery(petLandingQuery);
  const { data: saved } = useSuspenseQuery(landingHomeQuery);
  const matching = landingCards(
    [...(saved?.recent ?? []), ...listings, ...inventory],
    inputFromSearch(search),
  );
  const latest = selectDiscoveryCards(varietyOfPets(matching, matching.length), 4);
  return (
    <>
      <LandingListingsShowcase
        eyebrow="Bluebird Marketplace Pets"
        title="Latest pet listings"
        action="Browse all pets"
        browseSearch={{ ...search, petMode: "results", page: 1 }}
        listings={latest}
      />
      <HomepageShowcaseRows
        topListings={latest}
        extraInventory={inventory}
        eyebrow="Bluebird Marketplace Pets"
        rows={petShowcaseRows}
        baseSearch={search}
      />
    </>
  );
}

function LandingListingsShowcase({
  eyebrow,
  title,
  action,
  browseSearch,
  listings,
  compact,
  mobileCarousel,
}: {
  eyebrow: string;
  title: string;
  action: string;
  browseSearch: Search;
  listings: readonly ListingCardSummary[];
  compact?: boolean;
  mobileCarousel?: boolean;
}) {
  // This showcase is a single curated row. Keep it to the desktop row width
  // so a short second row can never appear beneath it.
  const { data: saved } = useSuspenseQuery(landingHomeQuery);
  const candidates = landingCards(
    [
      ...(saved?.recent ?? []),
      ...(saved?.motors ?? []),
      ...(saved?.onlineMerchandise ?? []),
      ...listings,
    ],
    inputFromSearch(browseSearch),
  );
  const visibleListings = varietyOf(mixPetSpecies(candidates), compact ? 5 : 4);

  return (
    <section
      className="mt-10 sm:mt-14"
      aria-labelledby={`${eyebrow}-${title}`.replaceAll(" ", "-").toLowerCase()}
    >
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border pb-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h2
            id={`${eyebrow}-${title}`.replaceAll(" ", "-").toLowerCase()}
            className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
          >
            {title}
          </h2>
        </div>
        <Link
          to="/browse"
          search={browseSearch}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
        >
          {action}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {visibleListings.length > 0 ? (
        <ul
          className={
            mobileCarousel
              ? "no-scrollbar grid auto-cols-[220px] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-2 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-4 sm:overflow-visible lg:grid-cols-4"
              : compact
                ? "grid grid-cols-2 gap-3 lg:grid-cols-5"
                : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          }
        >
          {visibleListings.map((listing, index) => (
            // Compact rows show four (2 × 2) below desktop, five across on it.
            <li
              key={listing.id}
              className={`min-w-0 ${mobileCarousel ? "snap-start" : ""} ${compact && index === 4 ? "hidden lg:block" : ""}`}
            >
              <ListingCard listing={listing} priority={index === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <CategoryGettingStarted />
      )}
    </section>
  );
}

function showcaseSearch(search: Search, href: string): Search {
  const params = Object.fromEntries(new URL(href, "https://onbluebird.com").searchParams);
  return {
    ...search,
    ...params,
    // Row links target results, but these are still landing-page previews.
    ...(search.category === "firearms" && search.firearmMode !== "results"
      ? { firearmMode: "landing" as const }
      : {}),
    page: 1,
  };
}

function HomepageShowcaseRows({
  eyebrow,
  rows,
  jobSearch,
  baseSearch,
  topListings,
  extraInventory,
}: {
  eyebrow: string;
  rows: readonly HomepagePreviewRow[];
  jobSearch?: Search;
  baseSearch?: Search;
  /** The listings the "Latest" showcase above the rows already shows. */
  topListings?: readonly ListingCardSummary[];
  extraInventory?: readonly ListingCardSummary[];
}) {
  const querySearch = jobSearch ?? baseSearch;
  const { data: saved } = useSuspenseQuery(landingHomeQuery);
  const pool = [
    ...(saved?.recent ?? []),
    ...(saved?.motors ?? []),
    ...(saved?.onlineMerchandise ?? []),
    ...(topListings ?? []),
    ...(extraInventory ?? []),
  ];
  const sellerCounts = new Map<string, number>();
  const topCandidates = querySearch
    ? landingCards(
        pool,
        inputFromSearch(
          querySearch.category === "firearms"
            ? {
                ...querySearch,
                firearmMode: "landing",
                firearmListingType: "Firearm",
                firearmType: undefined,
                firearmBrand: undefined,
                firearmAccessoryType: undefined,
              }
            : querySearch,
        ),
      )
    : [...(topListings ?? [])];
  const top = selectDiscoveryCards(varietyOf(topCandidates, topCandidates.length), 5, sellerCounts);
  const shownIds = new Set(top.map((listing) => listing.id));
  const allocated = rows.map((row) => {
    const matching = querySearch
      ? landingCards(pool, inputFromSearch(showcaseSearch(querySearch, row.href)))
      : [];
    const select = querySearch?.category === "pets" ? varietyOfPets : varietyOf;
    const fresh = selectDiscoveryCards(
      select(matching, matching.length),
      5,
      sellerCounts,
      shownIds,
    );
    const picks =
      fresh.length >= 5
        ? fresh
        : [
            ...fresh,
            ...select(
              matching.filter((listing) => !fresh.some((pick) => pick.id === listing.id)),
              5 - fresh.length,
            ),
          ];
    for (const listing of picks) shownIds.add(listing.id);
    return { row, picks };
  });
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {allocated.map(({ row, picks }) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                {eyebrow}
              </p>
              <h2
                id={row.title.replaceAll(" ", "-").toLowerCase()}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <a
              href={row.href}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              {row.action}
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
          {picks.length > 0 ? (
            <div className="min-h-32 grid grid-cols-2 gap-3 lg:grid-cols-5">
              {picks.map((listing, index) => (
                <div
                  key={listing.id}
                  className={index === 4 ? "hidden min-w-0 lg:block" : "min-w-0"}
                >
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          ) : (
            <CategoryPreviewEmpty />
          )}
        </section>
      ))}
    </div>
  );
}

function SponsoredHeroBadge({ compact = false }: { compact?: boolean } = {}) {
  return (
    <Link
      to="/advertise"
      aria-label="Sponsored by Bluebird Marketplace — learn about advertising with us"
      className={`inline-flex max-w-full items-center rounded-full border border-accent/70 bg-primary/90 text-left text-primary-foreground backdrop-blur-md transition-transform hover:-translate-y-0.5 ${compact ? "max-w-[190px] gap-1.5 px-2 py-1 shadow-sm sm:max-w-none sm:px-2.5" : "gap-1.5 px-2 py-1 shadow-lg sm:gap-2.5 sm:px-3.5 sm:py-2"}`}
    >
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground ${compact ? "" : "sm:size-7"}`}
      >
        <Megaphone
          size={15}
          className={compact ? "size-3" : "size-3 sm:size-[15px]"}
          weight="fill"
          aria-hidden="true"
        />
      </span>
      <span
        className={`min-w-0 flex-1 whitespace-normal font-bold uppercase leading-snug text-accent ${compact ? "text-[9px] tracking-[0.04em]" : "text-[9px] tracking-[0.1em] sm:text-[10px] sm:tracking-[0.12em]"}`}
      >
        <span className="sm:hidden">
          {compact ? "SPONSORED BY BLUEBIRD" : "SPONSORED BY BLUEBIRD MARKETPLACE"}
        </span>
        <span className="hidden sm:inline">SPONSORED BY BLUEBIRD MARKETPLACE</span>
      </span>
      <ArrowRight
        size={15}
        weight="bold"
        className="ml-1 hidden shrink-0 text-accent sm:block"
        aria-hidden="true"
      />
    </Link>
  );
}

function HomesLandingHero({
  activeTab,
  location,
  resultCount,
  onTabChange,
  onSearch,
  onMoreFilters,
}: {
  activeTab: HomeTab;
  location: string;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onSearch: (location: string) => void;
  onMoreFilters: () => void;
}) {
  const [draft, setDraft] = useState(location);

  useEffect(() => setDraft(location), [location]);

  return (
    <section
      aria-label="Bluebird Marketplace Homes"
      className="relative isolate overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 72%), rgb(11 26 38 / 38%) 52%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/55 via-transparent to-primary/15" />
      <div className="relative z-20 flex justify-end px-4 pt-4 sm:absolute sm:right-7 sm:top-7 sm:p-0">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex items-center justify-center px-4 pb-5 pt-3 sm:min-h-[680px] sm:px-8 sm:pb-12 sm:pt-16">
        <div className="w-full max-w-[650px] rounded-[28px] border border-white/20 bg-primary/80 p-4 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Bluebird Marketplace Homes
          </p>
          <h1 className="mt-2 text-center font-display text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
            Your next chapter.
            <span className="block text-accent">Starts at home.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[43ch] text-center text-[13px] leading-relaxed text-white/80 sm:text-[15px]">
            Buy, rent, or build your next home.
          </p>

          <div className="mt-4 grid sm:mt-7 grid-cols-3 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            {homeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={activeTab === tab.value}
                onClick={() => onTabChange(tab.value)}
                className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${activeTab === tab.value ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2 rounded-2xl bg-card p-2 text-foreground sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(draft);
            }}
          >
            <label className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:px-3">
              <MapPin
                size={19}
                weight="duotone"
                className="shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="sr-only">County, city, neighborhood, or ZIP</span>
              <input
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                list="homes-hero-locations"
                placeholder="City or ZIP code"
                aria-label="County, city, neighborhood, or ZIP"
                className="h-12 w-full min-w-0 flex-1 bg-transparent text-[16px] sm:text-[13px] outline-none placeholder:text-muted-foreground"
              />
              <LocationOptions id="homes-hero-locations" query={draft} />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 sm:gap-2 sm:px-5 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <MagnifyingGlass size={17} aria-hidden="true" />
              <span className="sm:hidden">Search</span>
              <span className="hidden sm:inline">Search homes</span>
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <span className="text-white/70">
              {resultCount.toLocaleString()} local listings to explore
            </span>
            <button
              type="button"
              onClick={onMoreFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              More filters
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeShowcaseRows({
  activeTab,
  listings,
  search,
}: {
  activeTab: HomeTab;
  listings: ClassifiedCard[];
  search: Search;
}) {
  const { data: saved } = useSuspenseQuery(landingHomeQuery);
  const pool = landingCards([...(saved?.recent ?? []), ...listings], inputFromSearch(search));
  // Each row shows only homes that match its heading and that no row above
  // (or the "Buy listings" showcase) already shows; it repeats a home only
  // when it has fewer than four new ones. A row with nothing that fits stays
  // hidden.
  const sellerCounts = new Map<string, number>();
  const shownIds = new Set(
    selectDiscoveryCards(pool, 4, sellerCounts).map((listing) => listing.id),
  );
  const rows = homePreviewRowsByTab[activeTab]
    .map((row) => {
      const matching = pool.filter(homeRowFilters[row.title] ?? (() => false));
      const fresh = selectDiscoveryCards(matching, 4, sellerCounts, shownIds);
      const homes =
        fresh.length >= 4
          ? fresh
          : varietyOf([...fresh, ...matching.filter((listing) => !fresh.includes(listing))], 4);
      for (const listing of homes) shownIds.add(listing.id);
      return { row, homes };
    })
    .filter(({ homes }) => homes.length > 0);
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {rows.map(({ row, homes }) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                Bluebird Marketplace Homes
              </p>
              <h2
                id={row.title.replaceAll(" ", "-").toLowerCase()}
                className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
              >
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={{
                category: "other-real-estate",
                homeMode: "results",
                homeTab: activeTab,
              }}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              {row.action}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {homes.slice(0, 4).map((listing) => (
              <ListingCard key={`${row.title}-${listing.id}`} listing={listing} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ServicesLandingHero({
  resultCount,
  onSearch,
  onPost,
}: {
  resultCount: number;
  onSearch: (subcategory: string) => void;
  onPost: () => void;
}) {
  const [mode, setMode] = useState<"search" | "post">("search");
  const [subcategory, setSubcategory] = useState("");

  return (
    <section
      aria-label="Bluebird Marketplace Services"
      className="relative isolate overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 64%), rgb(11 26 38 / 30%) 58%, rgb(11 26 38 / 12%)), url(https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      <div className="relative z-20 flex justify-end px-4 pt-4 sm:absolute sm:right-7 sm:top-7 sm:p-0">
        <SponsoredHeroBadge />
      </div>
      <div className="relative flex items-center justify-center px-4 pb-5 pt-3 sm:min-h-[680px] sm:px-8 sm:pb-12 sm:pt-16">
        <div className="w-full max-w-[720px] rounded-[28px] border border-white/20 bg-primary/80 p-4 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Bluebird Marketplace Services
          </p>
          <h1 className="mt-2 text-center font-display text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
            Big plans. <span className="text-accent">Local hands.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[46ch] text-center text-[13px] leading-relaxed text-white/80 sm:text-[15px]">
            Local help for your next project.
          </p>

          <div className="mt-4 grid sm:mt-7 grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button
              type="button"
              aria-pressed={mode === "search"}
              onClick={() => setMode("search")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Search Listings
            </button>
            <button
              type="button"
              aria-pressed={mode === "post"}
              onClick={() => setMode("post")}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
            >
              Post a Listing
            </button>
          </div>

          {mode === "search" ? (
            <form
              className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:block"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch(subcategory.trim());
              }}
            >
              <ServiceCategoryPicker value={subcategory} onChange={setSubcategory} />
              <button
                type="submit"
                className="mx-auto inline-flex h-12 sm:mt-4 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-[13px] sm:px-6 font-bold text-accent-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <MagnifyingGlass size={17} aria-hidden="true" />
                <span className="sm:hidden">Search</span>
                <span className="hidden sm:inline">
                  Show {resultCount.toLocaleString()} results
                </span>
              </button>
            </form>
          ) : (
            <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
              <p className="text-[18px] font-bold">Have a service to offer?</p>
              <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
                Reach local customers and show them what makes your work worth choosing.
              </p>
              <button
                type="button"
                onClick={onPost}
                className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90"
              >
                Post a Service Listing
              </button>
            </div>
          )}

          {mode === "search" && (
            <div className="mt-5 text-center text-[12px] text-white/70">
              {resultCount.toLocaleString()} local services to explore
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ServiceCategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchCounts = useServerFn(getServiceTradeCounts);
  const counts = useQuery({
    queryKey: ["service-trade-counts"],
    queryFn: () => fetchCounts(),
    staleTime: 10 * 60_000,
    enabled: open,
  });
  const options = allServiceCategories.filter(
    (category) => !value.trim() || category.name.toLowerCase().includes(value.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative text-foreground">
      <label className="relative flex h-12 items-center rounded-xl bg-card px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-primary">
        <MagnifyingGlass size={18} className="mr-2 shrink-0 text-primary" aria-hidden="true" />
        <span className="sr-only">What service are you looking for?</span>
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="What service are you looking for?"
          aria-label="What service are you looking for?"
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <CaretDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </label>
      {open && (
        <div
          role="listbox"
          aria-label="Service categories"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-b-xl border border-border bg-card shadow-xl"
        >
          {options.length > 0 ? (
            options.map((category) => (
              <button
                key={category.name}
                type="button"
                role="option"
                aria-selected={value === category.name}
                onClick={() => {
                  onChange(category.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-border/70 px-3 py-2.5 text-left text-[13px] last:border-b-0 hover:bg-secondary"
              >
                <span>{category.name}</span>
                {counts.data ? (
                  <span className="numeric text-[11px] text-muted-foreground">
                    {(counts.data[category.name] ?? 0).toLocaleString()}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">
              No service categories found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ServicesCategoryShowcase({
  onCategorySelect,
}: {
  onCategorySelect: (category: string) => void;
}) {
  // Real counts: local businesses in the services directory per trade.
  const fetchCounts = useServerFn(getServiceTradeCounts);
  const counts = useQuery({
    queryKey: ["service-trade-counts"],
    queryFn: () => fetchCounts(),
    staleTime: 10 * 60_000,
  });
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {serviceCategoryRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 border-b border-border pb-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird Marketplace Services
            </p>
            <h2
              id={row.title.replaceAll(" ", "-").toLowerCase()}
              className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
            >
              {row.title}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {row.categories.map((category) => (
              <button
                key={category.name}
                type="button"
                onClick={() => onCategorySelect(category.name)}
                className="group text-left"
              >
                <div className="aspect-[1.65/1] overflow-hidden rounded-2xl border border-border/70 bg-secondary shadow-sm">
                  <img
                    src={category.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-2 text-center text-[13px] font-semibold leading-tight group-hover:text-primary">
                  {category.name}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="browse-all-service-categories">
        <div className="mb-4 border-b border-border pb-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Bluebird Marketplace Services
          </p>
          <h2
            id="browse-all-service-categories"
            className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]"
          >
            Browse all categories
          </h2>
        </div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {allServiceCategories.map((category) => (
            <button
              key={category.name}
              type="button"
              onClick={() => onCategorySelect(category.name)}
              className="flex items-center justify-between border-b border-border/60 py-2 text-left text-[13px] transition-colors hover:text-primary"
            >
              <span>{category.name}</span>
              {counts.data ? (
                <span className="numeric text-muted-foreground">
                  ({(counts.data[category.name] ?? 0).toLocaleString()})
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function JobsLandingHero({
  search,
  resultCount,
  onSearch,
  onMoreFilters,
  onPost,
}: {
  search: Search;
  resultCount: number;
  onSearch: (patch: Partial<Search>) => void;
  onMoreFilters: (patch: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [mode, setMode] = useState<"search" | "post">("search");
  const [draft, setDraft] = useState(search.q ?? "");
  const [category, setCategory] = useState(search.jobCategory ?? "");
  const [location, setLocation] = useState(search.city ?? search.postalCode ?? "");
  const [payType, setPayType] = useState(search.jobPayType ?? "");

  useEffect(() => {
    setDraft(search.q ?? "");
    setCategory(search.jobCategory ?? "");
    setLocation(search.city ?? search.postalCode ?? "");
    setPayType(search.jobPayType ?? "");
  }, [search.q, search.jobCategory, search.city, search.postalCode, search.jobPayType]);

  // A city searches within 25 miles of it; a ZIP code matches that ZIP.
  const locationPatch = (): Partial<Search> => {
    const place = location.trim();
    if (!place) return { city: undefined, postalCode: undefined, radiusMiles: undefined };
    if (/^\d{5}$/.test(place))
      return { postalCode: place, city: undefined, radiusMiles: undefined };
    return { city: place, postalCode: undefined, radiusMiles: search.radiusMiles ?? 25 };
  };

  return (
    <section
      aria-label="Bluebird Marketplace Jobs"
      className="relative isolate overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 78%), rgb(11 26 38 / 42%) 55%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-primary/10" />
      {/* The badge gets its own row above the card, so the two never overlap. */}
      <div className="relative flex flex-col px-4 pb-8 pt-4 sm:min-h-[520px] sm:px-8 sm:pb-10 sm:pt-6">
        <div className="relative z-20 flex justify-end">
          <SponsoredHeroBadge />
        </div>
        <div className="flex flex-1 items-center justify-center pt-4">
          <div className="w-full max-w-[640px] rounded-[24px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Bluebird Marketplace Jobs
            </p>
            <h1 className="mt-2 text-center font-display text-[28px] font-bold leading-[1.05] tracking-tight sm:text-[44px]">
              Your next move. <span className="text-accent">Starts here.</span>
            </h1>
            <p className="mx-auto mt-3 max-w-[46ch] text-center text-[13.5px] leading-relaxed text-white/80 sm:text-[14.5px]">
              Local jobs. New possibilities.
            </p>

            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
              <button
                type="button"
                aria-pressed={mode === "search"}
                onClick={() => setMode("search")}
                className={`rounded-xl px-2 py-2.5 text-[13px] font-bold transition-colors sm:text-[14px] ${mode === "search" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
              >
                Search Jobs
              </button>
              <button
                type="button"
                aria-pressed={mode === "post"}
                onClick={() => setMode("post")}
                className={`rounded-xl px-2 py-2.5 text-[13px] font-bold transition-colors sm:text-[14px] ${mode === "post" ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
              >
                Post a Job
              </button>
            </div>

            {mode === "search" ? (
              <>
                <form
                  className="mt-3 flex flex-col gap-2 rounded-2xl bg-card p-2 text-foreground"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSearch({
                      q: draft.trim() || undefined,
                      jobCategory: category || undefined,
                      ...locationPatch(),
                      jobPayType: payType && !payType.startsWith("Any ") ? payType : undefined,
                    });
                  }}
                >
                  <label className="flex min-w-0 items-center gap-2 px-3">
                    <MagnifyingGlass
                      size={19}
                      className="shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Search jobs</span>
                    <input
                      type="search"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="What job are you looking for?"
                      aria-label="Search jobs"
                      className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:opacity-90"
                    >
                      Search
                    </button>
                  </label>
                </form>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="relative col-span-2 block min-w-0 sm:col-span-1">
                    <span className="sr-only">City or ZIP code</span>
                    <MapPin
                      size={16}
                      weight="fill"
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary"
                    />
                    <input
                      type="text"
                      list="jobs-hero-locations"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="City or ZIP code"
                      aria-label="City or ZIP code"
                      autoComplete="address-level2"
                      className="h-12 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <LocationOptions id="jobs-hero-locations" query={location} />
                  </label>
                  <JobSelect
                    label="Category"
                    options={jobCategoryOptions}
                    value={category}
                    onChange={setCategory}
                  />
                  <JobSelect
                    label="Job pay range"
                    options={jobPayTypeOptions}
                    value={payType}
                    onChange={setPayType}
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                  <span className="text-white/70">
                    {resultCount.toLocaleString()} local jobs to explore
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onMoreFilters({
                        jobCategory: category || undefined,
                        ...locationPatch(),
                        jobPayType: payType && !payType.startsWith("Any ") ? payType : undefined,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    More filters <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-card p-6 text-center text-foreground sm:p-8">
                <p className="text-[18px] font-bold">Have a great opportunity?</p>
                <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
                  Reach local candidates and share the details that make your team worth joining.
                </p>
                <button
                  type="button"
                  onClick={onPost}
                  className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[13px] font-bold text-primary-foreground hover:opacity-90"
                >
                  Post a Job Listing
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function VehicleMultiSelectPanel({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="min-w-0">
      <VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} />
      <button
        type="button"
        onClick={() => onApply(draft)}
        className="mt-2 h-9 w-full rounded-lg border border-primary text-[11px] font-bold text-primary hover:bg-secondary"
      >
        Apply {label}
      </button>
    </div>
  );
}

function VehicleBrowseHero({
  search,
  resultCount,
  activeFilterCount,
  term,
  onTermChange,
  onSearch,
  onFilterChange,
  onSell,
}: {
  search: Search;
  resultCount: number;
  activeFilterCount: number;
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onFilterChange: (patch: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [expandedFilter, setExpandedFilter] = useState<VehicleHeroFilter | null>(null);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const locationLabel = search.city
    ? `${search.city}${search.state ? `, ${search.state}` : ""}`
    : (search.region ?? search.state ?? "Any location");
  const yearLabel =
    search.yearMin != null || search.yearMax != null
      ? `${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`
      : "Year";
  const priceLabel =
    search.priceMin != null || search.priceMax != null
      ? search.priceMin != null && search.priceMax != null
        ? `$${search.priceMin}–$${search.priceMax}`
        : search.priceMin != null
          ? `$${search.priceMin}+`
          : `Up to $${search.priceMax}`
      : "Price";
  const selectedSummary = (value: string | undefined, fallback: string) => {
    const values = value?.split("||").filter(Boolean) ?? [];
    return values.length === 0
      ? fallback
      : values.length === 1
        ? (values[0] ?? fallback)
        : `${values.length} selected`;
  };
  const makeModelValues = [search.make, search.model].flatMap(
    (value) => value?.split("||").filter(Boolean) ?? [],
  );
  const makeModelLabel =
    makeModelValues.length === 0
      ? "Make / model"
      : makeModelValues.length === 1
        ? (makeModelValues[0] ?? "Make / model")
        : `${makeModelValues.length} selected`;
  const toggleFilter = (filter: VehicleHeroFilter) =>
    setExpandedFilter((current) => (current === filter ? null : filter));
  const applyInlineFilter = (patch: Partial<Search>) => {
    onFilterChange(patch);
    setExpandedFilter(null);
  };

  const quickFilters: { key: VehicleHeroFilter; label: string; value?: string }[] = [
    { key: "makeModel", label: makeModelLabel },
    { key: "year", label: yearLabel },
    { key: "price", label: priceLabel },
    {
      key: "mileage",
      label: selectedSummary(
        search.mileageBands,
        search.mileageMax != null ? `≤ ${search.mileageMax.toLocaleString()} mi` : "Mileage",
      ),
    },
    { key: "bodyStyle", label: selectedSummary(search.bodyStyle, "Body type") },
    { key: "titleStatus", label: selectedSummary(search.titleStatus, "Title type") },
  ];
  const additionalFilters: { key: VehicleHeroFilter; label: string }[] = [
    { key: "condition", label: selectedSummary(search.condition, "Condition") },
    { key: "fulfillment", label: selectedSummary(search.fulfillment, "Delivery") },
    { key: "drivetrain", label: selectedSummary(search.drivetrain, "Drive type") },
    { key: "transmission", label: selectedSummary(search.transmission, "Transmission") },
    { key: "fuelType", label: selectedSummary(search.fuelType, "Fuel type") },
    { key: "exteriorColor", label: selectedSummary(search.exteriorColor, "Exterior color") },
  ];

  function filterPanel(filter: VehicleHeroFilter) {
    switch (filter) {
      case "makeModel":
        return <InlineVehicleMakeModelFilter search={search} onApply={applyInlineFilter} />;
      case "year":
        return (
          <InlineRangeFilter
            firstLabel="Year from"
            secondLabel="Year to"
            firstValue={search.yearMin}
            secondValue={search.yearMax}
            onApply={(first, second) => applyInlineFilter({ yearMin: first, yearMax: second })}
          />
        );
      case "price":
        return (
          <InlineRangeFilter
            firstLabel="Min price"
            secondLabel="Max price"
            firstValue={search.priceMin}
            secondValue={search.priceMax}
            onApply={(first, second) => applyInlineFilter({ priceMin: first, priceMax: second })}
            prefix="$"
          />
        );
      case "mileage":
        return (
          <InlineSingleFilter
            label="Mileage"
            value={search.mileageBands}
            options={mileageBandOptions}
            onApply={(value) => applyInlineFilter({ mileageBands: value })}
          />
        );
      case "bodyStyle":
        return (
          <InlineMultiFilter
            label="Body type"
            value={search.bodyStyle}
            options={vehicleOptions.bodyStyles}
            onApply={(value) => applyInlineFilter({ bodyStyle: value })}
          />
        );
      case "titleStatus":
        return (
          <InlineMultiFilter
            label="Title type"
            value={search.titleStatus}
            options={vehicleOptions.titleStatuses}
            onApply={(value) => applyInlineFilter({ titleStatus: value })}
          />
        );
      case "drivetrain":
        return (
          <InlineMultiFilter
            label="Drive type"
            value={search.drivetrain}
            options={vehicleOptions.drivetrains}
            onApply={(value) => applyInlineFilter({ drivetrain: value })}
          />
        );
      case "transmission":
        return (
          <InlineMultiFilter
            label="Transmission"
            value={search.transmission}
            options={vehicleOptions.transmissions}
            onApply={(value) => applyInlineFilter({ transmission: value })}
          />
        );
      case "fuelType":
        return (
          <InlineMultiFilter
            label="Fuel type"
            value={search.fuelType}
            options={vehicleOptions.fuelTypes}
            onApply={(value) => applyInlineFilter({ fuelType: value })}
          />
        );
      case "exteriorColor":
        return (
          <InlineMultiFilter
            label="Exterior color"
            value={search.exteriorColor}
            options={vehicleOptions.exteriorColors}
            onApply={(value) => applyInlineFilter({ exteriorColor: value })}
          />
        );
      case "location":
        return <InlineLocationFilter search={search} onApply={applyInlineFilter} />;
      case "condition":
        return (
          <InlineMultiFilter
            label="Condition"
            value={search.condition}
            options={vehicleConditionOptions}
            onApply={(value) => applyInlineFilter({ condition: value })}
          />
        );
      case "fulfillment":
        return (
          <InlineMultiFilter
            label="Delivery"
            value={search.fulfillment}
            options={[
              { value: "local_pickup", label: "Local pickup" },
              { value: "shipping", label: "Ships" },
              { value: "both", label: "Pickup or shipping" },
            ]}
            onApply={(value) => applyInlineFilter({ fulfillment: value })}
          />
        );
    }
  }

  const filterIsActive = (key: VehicleHeroFilter) => {
    switch (key) {
      case "makeModel":
        return Boolean(search.make || search.model);
      case "year":
        return search.yearMin != null || search.yearMax != null;
      case "price":
        return search.priceMin != null || search.priceMax != null;
      case "mileage":
        return Boolean(search.mileageBands) || search.mileageMax != null;
      case "location":
        return Boolean(
          search.city ||
          search.state ||
          search.region ||
          search.postalCode ||
          search.latitude != null ||
          search.longitude != null,
        );
      default:
        return Boolean(search[key]);
    }
  };

  return (
    <section
      aria-label="Bluebird Motors vehicle search"
      className="floating-card relative overflow-visible bg-surface px-4 py-4 sm:px-8 sm:py-6"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-blue/12" />
        <div className="absolute -bottom-40 left-1/3 h-64 w-64 rounded-full bg-brand-warm/20" />
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <p className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[10px]">
          Bluebird motors
        </p>
        <SponsoredHeroBadge compact />
      </div>

      <div className="relative mt-5 sm:mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="max-w-[22ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
              Find your next gem on wheels.
            </h1>
            <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
              Shop cars, trucks, powersports, trailers, and more from local sellers.
            </p>
          </div>

          <div className="grid w-[184px] shrink-0 grid-cols-2 self-start rounded-full border border-primary/15 bg-white p-1 shadow-sm sm:self-auto">
            <button
              type="button"
              className="h-9 rounded-full bg-primary px-4 text-[13px] font-bold text-primary-foreground"
              aria-pressed="true"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={onSell}
              className="h-9 rounded-full px-4 text-[13px] font-semibold text-primary transition-colors hover:bg-brand-blue/10"
            >
              Sell
            </button>
          </div>
        </div>

        <form
          aria-label="Vehicle quick search"
          className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-brand-blue/15 bg-brand-blue/5 p-2 sm:gap-3 sm:p-3 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label
            className={`relative flex h-12 min-w-0 items-center rounded-xl border px-3 shadow-sm transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/15 ${term ? "border-brand-blue/50 bg-brand-blue/10" : "border-primary/15 bg-white"}`}
          >
            <MagnifyingGlass size={18} className="shrink-0 text-brand-blue" aria-hidden="true" />
            <span className="sr-only">Search vehicles</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search for..."
              aria-label="Search vehicles"
              className="w-full min-w-0 flex-1 bg-transparent px-2 text-[16px] text-primary outline-none placeholder:text-muted-foreground sm:text-[13.5px]"
            />
            {term && (
              <button
                type="button"
                onClick={() => onTermChange("")}
                aria-label="Clear vehicle search"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-brand-blue/10 hover:text-primary"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          {quickFilters.map(({ key, label }) => (
            <VehicleQuickFilter
              key={key}
              label={label}
              active={filterIsActive(key)}
              expanded={expandedFilter === key}
              onClick={() => toggleFilter(key)}
            >
              {filterPanel(key)}
            </VehicleQuickFilter>
          ))}
          <VehicleQuickFilter
            label={locationLabel === "Any location" ? "Location" : locationLabel}
            ariaLabel="Select location"
            icon={
              <MapPin
                size={18}
                weight="duotone"
                className="shrink-0 text-brand-blue"
                aria-hidden="true"
              />
            }
            active={filterIsActive("location")}
            expanded={expandedFilter === "location"}
            alignEnd
            onClick={() => toggleFilter("location")}
          >
            {filterPanel("location")}
          </VehicleQuickFilter>
          {showAllFilters && (
            <div className="col-span-full grid grid-cols-2 gap-2 border-t border-brand-blue/15 pt-3 sm:grid-cols-3 sm:gap-3">
              {additionalFilters.map(({ key, label }) => (
                <VehicleQuickFilter
                  key={key}
                  label={label}
                  active={filterIsActive(key)}
                  expanded={expandedFilter === key}
                  onClick={() => toggleFilter(key)}
                >
                  {filterPanel(key)}
                </VehicleQuickFilter>
              ))}
            </div>
          )}
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
          <button
            type="button"
            onClick={() => {
              setShowAllFilters((current) => !current);
              setExpandedFilter(null);
            }}
            className="inline-flex items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
          >
            <FunnelSimple
              size={17}
              weight="duotone"
              className="text-brand-blue"
              aria-hidden="true"
            />
            <span className="sm:hidden">{showAllFilters ? "Fewer filters" : "All filters"}</span>
            <span className="hidden sm:inline">
              {showAllFilters ? "Hide all search filters" : "Show all search filters"}
            </span>
            {activeFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onSearch}
            className="ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-sky-700 px-4 font-bold text-white shadow-sm transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue sm:px-5"
          >
            <MagnifyingGlass size={17} aria-hidden="true" />
            Show {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
          </button>
        </div>
      </div>
    </section>
  );
}

function VehicleQuickFilter({
  label,
  onClick,
  expanded,
  active = false,
  icon,
  ariaLabel,
  alignEnd = false,
  children,
}: {
  label: string;
  onClick: () => void;
  expanded: boolean;
  active?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
  alignEnd?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative min-w-0 ${expanded ? "z-30" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
        aria-expanded={expanded}
        title={label}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-[13.5px] font-semibold text-primary shadow-sm transition-colors hover:border-brand-blue/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${active || expanded ? "border-brand-blue/50 bg-brand-blue/10" : "border-primary/15 bg-white hover:bg-brand-blue/5"}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`shrink-0 text-brand-blue transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div
          className={`absolute top-[calc(100%+8px)] z-40 w-full rounded-xl border border-brand-blue/20 bg-white p-3 shadow-xl ${alignEnd ? "right-0 min-w-[280px] max-w-[calc(100vw-3rem)]" : "left-0"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function InlineVehicleMakeModelFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [make, setMake] = useState(search.make ?? "");
  const [model, setModel] = useState(search.model ?? "");
  const selectedMakes = splitVehicleFilter(make);
  const availableModels = modelsForMakes(selectedMakes);

  useEffect(() => {
    setMake(search.make ?? "");
    setModel(search.model ?? "");
  }, [search.make, search.model]);

  useEffect(() => {
    const available = new Set(modelsForMakes(splitVehicleFilter(make)));
    setModel((current) =>
      splitVehicleFilter(current)
        .filter((value) => available.has(value))
        .join("||"),
    );
  }, [make]);

  return (
    <div className="w-full space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Makes
      </p>
      <VehicleCheckboxList
        label="Makes"
        value={make}
        options={vehicleOptions.makes}
        onChange={setMake}
      />
      {selectedMakes.length > 0 && (
        <>
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Models
          </p>
          <VehicleCheckboxList
            label="Models"
            value={model}
            options={availableModels}
            onChange={setModel}
          />
        </>
      )}
      <InlineApplyButton
        onClick={() => onApply({ make: make || undefined, model: model || undefined })}
      />
    </div>
  );
}

function InlineMultiFilter({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string | undefined;
  options: readonly VehicleFilterOption[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <VehicleCheckboxList label={label} value={draft} options={options} onChange={setDraft} />
      <InlineApplyButton onClick={() => onApply(draft)} />
    </div>
  );
}

function InlineSingleFilter({
  label,
  value,
  options,
  onApply,
}: {
  label: string;
  value: string | undefined;
  options: readonly VehicleFilterOption[];
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(splitVehicleFilter(value)[0] ?? "");
  useEffect(() => setDraft(splitVehicleFilter(value)[0] ?? ""), [value]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <VehicleSingleSelectList label={label} value={draft} options={options} onChange={setDraft} />
      <InlineApplyButton onClick={() => onApply(draft)} />
    </div>
  );
}

function InlineRangeFilter({
  firstLabel,
  secondLabel,
  firstValue,
  secondValue,
  onApply,
  prefix = "",
}: {
  firstLabel: string;
  secondLabel: string;
  firstValue: number | undefined;
  secondValue: number | undefined;
  onApply: (first?: number, second?: number) => void;
  prefix?: string;
}) {
  const [first, setFirst] = useState(firstValue == null ? "" : String(firstValue));
  const [second, setSecond] = useState(secondValue == null ? "" : String(secondValue));

  useEffect(() => {
    setFirst(firstValue == null ? "" : String(firstValue));
    setSecond(secondValue == null ? "" : String(secondValue));
  }, [firstValue, secondValue]);

  const parse = (value: string) => {
    return optionalNonNegativeNumber(value);
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="relative">
          <span className="sr-only">{firstLabel}</span>
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type="number"
            min="0"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder={firstLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
        <label className="relative">
          <span className="sr-only">{secondLabel}</span>
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type="number"
            min="0"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder={secondLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
      </div>
      <InlineApplyButton
        onClick={() => {
          const min = parse(first);
          const max = parse(second);
          if (isInvertedRange(min, max)) {
            toast.error("Minimum cannot exceed maximum.");
            return;
          }
          onApply(min, max);
        }}
      />
    </div>
  );
}

function InlineNumberFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: number | undefined;
  onApply: (value?: number) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);

  return (
    <div className="w-full space-y-2.5">
      <label>
        <span className="sr-only">{label}</span>
        <input
          type="number"
          min="0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={label}
          className="filter-input w-full"
        />
      </label>
      <InlineApplyButton
        onClick={() => {
          onApply(optionalNonNegativeNumber(draft));
        }}
      />
    </div>
  );
}

function InlineSelectFilter({
  value,
  options,
  placeholder,
  onChange,
  optionLabels,
}: {
  value: string | undefined;
  options: readonly (string | { value: string; label: string })[];
  placeholder: string;
  onChange: (value?: string) => void;
  optionLabels?: Record<string, string>;
}) {
  return (
    <select
      autoFocus
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      className="filter-input w-full"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const label =
          typeof option === "string" ? (optionLabels?.[option] ?? option) : option.label;
        return (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

function FirearmFilterFields({ search }: { search: Search }) {
  const [listingType, setListingType] = useState(search.firearmListingType ?? "");

  return (
    <>
      <select
        name="firearmListingType"
        aria-label="Firearm listing type"
        value={listingType}
        onChange={(event) => setListingType(event.target.value)}
        className="filter-input"
      >
        <option value="">Firearms and accessories</option>
        {firearmListingTypes.map((option) => (
          <option key={option} value={option}>
            {option === "Firearm" ? "Firearms only" : "Accessories only"}
          </option>
        ))}
      </select>
      {listingType !== "Accessory" && (
        <select
          name="firearmType"
          aria-label="Firearm type"
          defaultValue={listingType === "Accessory" ? "" : (search.firearmType ?? "")}
          className="filter-input"
        >
          <option value="">Any firearm type</option>
          {firearmTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
      <select
        name="firearmBrand"
        aria-label="Firearm or accessory brand"
        defaultValue={search.firearmBrand ?? ""}
        className="filter-input"
      >
        <option value="">Any brand</option>
        {firearmBrands.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {listingType !== "Firearm" && (
        <select
          name="firearmAccessoryType"
          aria-label="Firearm accessory type"
          defaultValue={listingType === "Firearm" ? "" : (search.firearmAccessoryType ?? "")}
          className="filter-input"
        >
          <option value="">Any accessory type</option>
          {firearmAccessoryTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

function renderBrowseListing(listing: ListingCardSummary) {
  return <ListingCard listing={listing} />;
}
function loadVehiclePreview(search: Search, _signal: AbortSignal) {
  return browseClassifieds({ data: inputFromSearch(search) });
}

function WebsiteBrowseLink({ search, ...props }: BrowseLinkProps) {
  return <Link {...props} to="/browse" search={search ?? {}} />;
}
function renderBrowseResultListing(
  listing: ListingCardSummary,
  index: number,
  view: "grid" | "list",
) {
  return view === "list" ? (
    <ListingRow listing={listing} />
  ) : (
    <ListingCard listing={listing} priority={index === 0} />
  );
}

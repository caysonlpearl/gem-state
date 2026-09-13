import { createServerFn } from "@tanstack/react-start";
import { publicServerClient } from "./supabase-public.server";
import { selectWeeklyTopTen } from "./weekly-top-ten";

/**
 * PostgREST's `or=` filter syntax treats `,` `.` `(` `)` and `\` as
 * structural characters, so raw search text can inject extra filter clauses
 * once interpolated into a `.or()` string. Backslash-escaping them (the
 * syntax PostgREST itself documents for literal values) keeps the text
 * matched literally by ILIKE without changing normal search behavior.
 */
function escapeFilterValue(value: string) {
  return value.replace(/[\\,.()]/g, "\\$&");
}

export type GeographyNode = {
  resortId: string;
  resortCode: string;
  resortSlug: string;
  resortName: string;
  currency: string;
  parks: {
    id: string;
    slug: string;
    name: string;
    kind: "park" | "district";
    locations: {
      id: string;
      slug: string;
      name: string;
      area: string | null;
      granularity: string;
    }[];
  }[];
};

export type CatalogFacets = {
  geography: GeographyNode[];
  categories: { id: string; slug: string; name: string }[];
};

export type CatalogImage = {
  id: string;
  src: string;
  alt: string;
  isExample: boolean;
  viewRole: "gallery" | "spin";
  angleDegrees: number | null;
};

export type CatalogModel = {
  id: string;
  src: string;
  posterSrc: string | null;
  disclosure: string;
  generationMethod: string;
};

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  collectionName: string | null;
  releaseDate: string | null;
  releaseType: string;
  retailPriceCents: number | null;
  currency: string;
  activeListingCount: number;
  lowestListingPriceCents: number | null;
  isDemo: boolean;
  variantCount: number;
  resortCodes: string[];
  primaryImage: CatalogImage | null;
};

export type BrowseResult = {
  products: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brandName: string | null;
  collectionName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  releaseDate: string | null;
  releaseType: string;
  retailPriceCents: number | null;
  currency: string;
  retailPriceSource: string | null;
  isDemo: boolean;
  images: CatalogImage[];
  model: CatalogModel | null;
  facts: { id: string; label: string; value: string }[];
  sources: {
    id: string;
    label: string;
    url: string;
    sourceKind: string;
    observedOn: string | null;
  }[];
  resorts: { code: string; name: string; slug: string }[];
  variants: {
    id: string;
    size: string | null;
    color: string | null;
    edition: string | null;
    skuLabel: string | null;
    label: string;
  }[];
};

const PAGE_SIZE = 24;

const demoImageFallbacks: Record<string, CatalogImage> = {
  "holiday-ceramic-mug": {
    id: "demo-holiday-ceramic-mug-example",
    src: "/images/products/holiday-ceramic-mug-example.jpg",
    alt: "Example lifestyle photograph of a park refreshment, used to preview the catalog image layout",
    isExample: true,
    viewRole: "gallery",
    angleDegrees: null,
  },
};

type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt: string | null;
  view_role: string;
  angle_degrees: number | null;
};

function catalogImages(
  product: { id: string; slug: string; name: string },
  rows: ProductImageRow[],
): CatalogImage[] {
  const images = rows
    .filter((row) => row.product_id === product.id)
    .map((row) => ({
      id: row.id,
      src: row.storage_path,
      alt: row.alt?.trim() || product.name,
      isExample: false,
      viewRole: (row.view_role === "spin" ? "spin" : "gallery") as CatalogImage["viewRole"],
      angleDegrees: row.angle_degrees,
    }));

  if (images.length > 0) return images;
  const fallback = demoImageFallbacks[product.slug];
  return fallback ? [fallback] : [];
}

function variantLabel(v: { size: string | null; color: string | null; edition: string | null }) {
  const parts = [v.size, v.color, v.edition].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "One variation";
}

export const getCatalogFacets = createServerFn({ method: "GET" }).handler(
  async (): Promise<CatalogFacets> => {
    const client = publicServerClient();
    const [{ data: resorts }, { data: parks }, { data: locations }, { data: categories }] =
      await Promise.all([
        client.from("resorts").select("id, code, slug, name, currency").order("position"),
        client.from("parks").select("id, resort_id, slug, name, kind").order("position"),
        client
          .from("locations")
          .select("id, park_id, slug, name, area, granularity")
          .order("position"),
        client.from("categories").select("id, slug, name").order("position"),
      ]);

    const geography: GeographyNode[] = (resorts ?? []).map((r) => ({
      resortId: r.id,
      resortCode: r.code,
      resortSlug: r.slug,
      resortName: r.name,
      currency: r.currency,
      parks: (parks ?? [])
        .filter((p) => p.resort_id === r.id)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          kind: p.kind as "park" | "district",
          locations: (locations ?? [])
            .filter((l) => l.park_id === p.id)
            .map((l) => ({
              id: l.id,
              slug: l.slug,
              name: l.name,
              area: l.area,
              granularity: l.granularity as string,
            })),
        })),
    }));

    return { geography, categories: categories ?? [] };
  },
);

export type BrowseInput = {
  q?: string | undefined;
  resort?: string | undefined;
  category?: string | undefined;
  sort?: "name" | "newest" | "price_low" | "price_high" | undefined;
  page?: number | undefined;
};

export const browseProducts = createServerFn({ method: "GET" })
  .inputValidator((input: BrowseInput): BrowseInput => ({
    q: input?.q ? String(input.q).slice(0, 80) : undefined,
    resort: input?.resort ? String(input.resort).slice(0, 12) : undefined,
    category: input?.category ? String(input.category).slice(0, 60) : undefined,
    sort: (["name", "newest", "price_low", "price_high"] as const).includes(input?.sort as never)
      ? input.sort
      : "newest",
    page: Math.max(1, Math.min(50, Number(input?.page ?? 1) || 1)),
  }))
  .handler(async ({ data }): Promise<BrowseResult> => {
    const client = publicServerClient();
    const page = data.page ?? 1;

    let productIds: string[] | null = null;
    if (data.resort) {
      const { data: resort } = await client
        .from("resorts")
        .select("id")
        .eq("code", data.resort.toUpperCase())
        .maybeSingle();
      if (!resort) return { products: [], total: 0, page, pageSize: PAGE_SIZE };
      const { data: links } = await client
        .from("product_resorts")
        .select("product_id")
        .eq("resort_id", resort.id);
      productIds = (links ?? []).map((l) => l.product_id);
      if (productIds.length === 0) return { products: [], total: 0, page, pageSize: PAGE_SIZE };
    }

    let query = client
      .from("products")
      .select(
        "id, slug, name, description, release_date, release_type, retail_price_cents, retail_price_currency, is_demo, categories(name, slug), collections(name)",
        { count: "exact" },
      )
      .eq("status", "published");

    if (productIds) query = query.in("id", productIds);
    if (data.q) {
      const q = escapeFilterValue(data.q);
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (data.category) {
      const { data: cat } = await client
        .from("categories")
        .select("id")
        .eq("slug", data.category)
        .maybeSingle();
      if (!cat) return { products: [], total: 0, page, pageSize: PAGE_SIZE };
      query = query.eq("category_id", cat.id);
    }

    switch (data.sort) {
      case "name":
        query = query.order("name", { ascending: true });
        break;
      case "price_low":
        query = query.order("retail_price_cents", { ascending: true, nullsFirst: false });
        break;
      case "price_high":
        query = query.order("retail_price_cents", { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order("release_date", { ascending: false, nullsFirst: false });
    }
    // Tiebreaker: many rows share the same value on every sort column above (most
    // acutely, dozens of products have a null release_date on the default sort).
    // Without a deterministic final key, Postgres doesn't guarantee stable order
    // across separate paginated requests, so the same product can land on two
    // different pages (and another product gets silently skipped).
    query = query.order("id", { ascending: true });

    const from = (page - 1) * PAGE_SIZE;
    const { data: rows, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("browseProducts failed", error.message);
      return { products: [], total: 0, page, pageSize: PAGE_SIZE };
    }

    const ids = (rows ?? []).map((r) => r.id);
    const [{ data: variants }, { data: links }, { data: imageRows }, { data: marketRows }] =
      await Promise.all([
        ids.length
          ? client.from("product_variants").select("product_id").in("product_id", ids)
          : Promise.resolve({ data: [] as { product_id: string }[] }),
        ids.length
          ? client.from("product_resorts").select("product_id, resorts(code)").in("product_id", ids)
          : Promise.resolve({
              data: [] as { product_id: string; resorts: { code: string } | null }[],
            }),
        ids.length
          ? client
              .from("product_images")
              .select("id, product_id, storage_path, alt, view_role, angle_degrees")
              .in("product_id", ids)
              .order("position")
          : Promise.resolve({ data: [] as ProductImageRow[] }),
        ids.length
          ? client
              .from("variant_market_summary")
              .select("product_id, lowest_ask_cents, active_ask_count")
              .in("product_id", ids)
          : Promise.resolve({
              data: [] as {
                product_id: string | null;
                lowest_ask_cents: number | null;
                active_ask_count: number | null;
              }[],
            }),
      ]);

    const marketByProduct = new Map<
      string,
      { activeListingCount: number; lowestListingPriceCents: number | null }
    >();
    for (const row of marketRows ?? []) {
      if (!row.product_id) continue;
      const current = marketByProduct.get(row.product_id) ?? {
        activeListingCount: 0,
        lowestListingPriceCents: null,
      };
      current.activeListingCount += Number(row.active_ask_count ?? 0);
      if (
        row.lowest_ask_cents != null &&
        (current.lowestListingPriceCents == null ||
          row.lowest_ask_cents < current.lowestListingPriceCents)
      ) {
        current.lowestListingPriceCents = row.lowest_ask_cents;
      }
      marketByProduct.set(row.product_id, current);
    }

    const products: ProductCard[] = (rows ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      categoryName: (r.categories as { name: string } | null)?.name ?? null,
      categorySlug: (r.categories as { slug: string } | null)?.slug ?? null,
      collectionName: (r.collections as { name: string } | null)?.name ?? null,
      releaseDate: r.release_date,
      releaseType: r.release_type,
      retailPriceCents: r.retail_price_cents,
      currency: r.retail_price_currency,
      activeListingCount: marketByProduct.get(r.id)?.activeListingCount ?? 0,
      lowestListingPriceCents: marketByProduct.get(r.id)?.lowestListingPriceCents ?? null,
      isDemo: r.is_demo,
      variantCount: (variants ?? []).filter((v) => v.product_id === r.id).length,
      resortCodes: (links ?? [])
        .filter((l) => l.product_id === r.id)
        .map((l) => (l.resorts as { code: string } | null)?.code)
        .filter((c): c is string => Boolean(c))
        .sort(),
      primaryImage:
        catalogImages({ id: r.id, slug: r.slug, name: r.name }, imageRows ?? [])[0] ?? null,
    }));

    return { products, total: count ?? products.length, page, pageSize: PAGE_SIZE };
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input.slug).slice(0, 120) }))
  .handler(async ({ data }): Promise<ProductDetail | null> => {
    const client = publicServerClient();
    const { data: product, error } = await client
      .from("products")
      .select(
        "id, slug, name, description, release_date, release_type, retail_price_cents, retail_price_currency, retail_price_source, is_demo, brands(name), collections(name), categories(name, slug)",
      )
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();

    if (error) console.error("getProductBySlug failed", error.message);
    if (!product) return null;

    const [
      { data: variants },
      { data: links },
      { data: imageRows },
      { data: modelRows },
      { data: facts },
      { data: sources },
    ] = await Promise.all([
      client
        .from("product_variants")
        .select("id, size, color, edition, sku_label")
        .eq("product_id", product.id)
        .order("position"),
      client
        .from("product_resorts")
        .select("resorts(code, name, slug)")
        .eq("product_id", product.id),
      client
        .from("product_images")
        .select("id, product_id, storage_path, alt, view_role, angle_degrees")
        .eq("product_id", product.id)
        .order("position"),
      client
        .from("product_models")
        .select("id, storage_path, poster_path, disclosure, generation_method")
        .eq("product_id", product.id)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1),
      client
        .from("product_facts")
        .select("id, label, value")
        .eq("product_id", product.id)
        .order("position"),
      client
        .from("product_sources")
        .select("id, label, url, source_kind, observed_on")
        .eq("product_id", product.id)
        .order("position"),
    ]);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brandName: (product.brands as { name: string } | null)?.name ?? null,
      collectionName: (product.collections as { name: string } | null)?.name ?? null,
      categoryName: (product.categories as { name: string; slug: string } | null)?.name ?? null,
      categorySlug: (product.categories as { name: string; slug: string } | null)?.slug ?? null,
      releaseDate: product.release_date,
      releaseType: product.release_type,
      retailPriceCents: product.retail_price_cents,
      currency: product.retail_price_currency,
      retailPriceSource: product.retail_price_source,
      isDemo: product.is_demo,
      images: catalogImages(
        { id: product.id, slug: product.slug, name: product.name },
        imageRows ?? [],
      ),
      model: modelRows?.[0]
        ? {
            id: modelRows[0].id,
            src: modelRows[0].storage_path,
            posterSrc: modelRows[0].poster_path,
            disclosure: modelRows[0].disclosure,
            generationMethod: modelRows[0].generation_method,
          }
        : null,
      facts: (facts ?? []).map((fact) => ({
        id: fact.id,
        label: fact.label,
        value: fact.value,
      })),
      sources: (sources ?? []).map((source) => ({
        id: source.id,
        label: source.label,
        url: source.url,
        sourceKind: source.source_kind,
        observedOn: source.observed_on,
      })),
      resorts: (links ?? [])
        .map((l) => l.resorts as { code: string; name: string; slug: string } | null)
        .filter((r): r is { code: string; name: string; slug: string } => Boolean(r)),
      variants: (variants ?? []).map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        edition: v.edition,
        skuLabel: v.sku_label,
        label: variantLabel(v),
      })),
    };
  });

/* ------------------------------------------------------- homepage sections */

/**
 * Everything the customer-facing landing page renders, read from real catalog
 * and market data through the anon publishable client. There is no ranking,
 * recommendation or trend calculation here: a row is either backed by real
 * rows or it comes back empty and the page says so in plain words.
 */
export type ResortSummary = {
  code: string;
  slug: string;
  name: string;
  productCount: number;
};

export type CategorySummary = {
  slug: string;
  name: string;
  productCount: number;
  image: CatalogImage | null;
};

export type MerchandiseShelf = {
  slug: string;
  title: string;
  description: string;
  browseSearch: { category?: string; resort?: string; q?: string };
  products: ProductCard[];
};

/** A compact market row: one exact variation with one honest price line. */
export type MarketCard = {
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  isDemo: boolean;
  /** e.g. "Lowest price", "Available to source from", "Reported in park". */
  marketLabel: string;
  priceCents: number | null;
  currency: string;
  /** Free-text secondary line already safe to display (no member identity). */
  detail: string | null;
};

export type HomeSections = {
  resorts: ResortSummary[];
  categories: CategorySummary[];
  newToCatalog: ProductCard[];
  topThisWeek: ProductCard[];
  merchandiseShelves: MerchandiseShelf[];
  lowestAsks: MarketCard[];
  sourcingOffers: MarketCard[];
  recentlySighted: MarketCard[];
  /** Real verified sales only. Empty until a pilot sale qualifies. */
  verifiedSales: MarketCard[];
  catalogSize: number;
};

type VariantJoin = {
  id: string;
  size: string | null;
  color: string | null;
  edition: string | null;
  products: { slug: string; name: string; is_demo: boolean; status: string } | null;
};

export const getHomeSections = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeSections> => {
    const client = publicServerClient();

    const [
      { data: resortRows },
      { data: categoryRows },
      { data: productLinks },
      { data: newRows, count: catalogCount },
      { data: askRows },
      { data: offerRows },
      { data: sightingRows },
      { data: saleRows },
    ] = await Promise.all([
      client.from("resorts").select("id, code, slug, name").order("position"),
      client.from("categories").select("id, slug, name").order("position"),
      client.from("product_resorts").select("product_id, resort_id"),
      client
        .from("products")
        .select(
          "id, slug, name, description, release_date, release_type, retail_price_cents, retail_price_currency, is_demo, category_id, categories(name, slug), collections(name)",
          { count: "exact" },
        )
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("variant_market_summary")
        .select("variant_id, lowest_ask_cents, active_ask_count")
        .not("lowest_ask_cents", "is", null)
        .order("lowest_ask_cents", { ascending: true })
        .limit(12),
      client
        .from("variant_sourcing_offers")
        .select("variant_id, price_cents, currency, fulfillment_window_days")
        .order("price_cents", { ascending: true })
        .limit(12),
      client
        .from("variant_sightings_public")
        .select(
          "variant_id, price_cents, currency, seen_at, location_name, resort_code, availability",
        )
        .order("seen_at", { ascending: false })
        .limit(12),
      client
        .from("verified_sales")
        .select("variant_id, price_cents, currency, sold_at")
        .order("sold_at", { ascending: false })
        .limit(12),
    ]);

    const variantIds = Array.from(
      new Set(
        [
          ...(askRows ?? []).map((r) => r.variant_id),
          ...(offerRows ?? []).map((r) => r.variant_id),
          ...(sightingRows ?? []).map((r) => r.variant_id),
          ...(saleRows ?? []).map((r) => r.variant_id),
        ].filter((id): id is string => Boolean(id)),
      ),
    );

    const { data: variantRows } = variantIds.length
      ? await client
          .from("product_variants")
          .select("id, size, color, edition, products(slug, name, is_demo, status)")
          .in("id", variantIds)
      : { data: [] as VariantJoin[] };

    const variantById = new Map<string, VariantJoin>(
      ((variantRows ?? []) as VariantJoin[]).map((v) => [v.id, v]),
    );

    function card(
      variantId: string | null,
      marketLabel: string,
      priceCents: number | null,
      currency: string | null,
      detail: string | null,
    ): MarketCard | null {
      if (!variantId) return null;
      const v = variantById.get(variantId);
      if (!v?.products || v.products.status !== "published") return null;
      return {
        variantId,
        productSlug: v.products.slug,
        productName: v.products.name,
        variantLabel: variantLabel(v),
        isDemo: v.products.is_demo,
        marketLabel,
        priceCents,
        currency: currency ?? "USD",
        detail,
      };
    }

    const dedupe = (cards: (MarketCard | null)[], limit = 6): MarketCard[] => {
      const seen = new Set<string>();
      const out: MarketCard[] = [];
      for (const c of cards) {
        if (!c || seen.has(c.variantId)) continue;
        seen.add(c.variantId);
        out.push(c);
        if (out.length >= limit) break;
      }
      return out;
    };

    const resorts: ResortSummary[] = (resortRows ?? []).map((r) => ({
      code: r.code,
      slug: r.slug,
      name: r.name,
      productCount: new Set(
        (productLinks ?? []).filter((l) => l.resort_id === r.id).map((l) => l.product_id),
      ).size,
    }));

    // Category counts must reflect the whole catalog, not just the newest page.
    const newProductIds = (newRows ?? []).map((row) => row.id);
    const [{ data: categoryCounts }, { data: newImageRows }, { data: newMarketRows }] =
      await Promise.all([
        client.from("products").select("category_id").eq("status", "published"),
        newProductIds.length
          ? client
              .from("product_images")
              .select("id, product_id, storage_path, alt, view_role, angle_degrees")
              .in("product_id", newProductIds)
              .order("position")
          : Promise.resolve({ data: [] as ProductImageRow[] }),
        newProductIds.length
          ? client
              .from("variant_market_summary")
              .select("product_id, lowest_ask_cents, active_ask_count")
              .in("product_id", newProductIds)
          : Promise.resolve({
              data: [] as {
                product_id: string | null;
                lowest_ask_cents: number | null;
                active_ask_count: number | null;
              }[],
            }),
      ]);
    const totalByCategory = new Map<string, number>();
    for (const row of categoryCounts ?? []) {
      if (!row.category_id) continue;
      totalByCategory.set(row.category_id, (totalByCategory.get(row.category_id) ?? 0) + 1);
    }

    const newMarketByProduct = new Map<
      string,
      { activeListingCount: number; lowestListingPriceCents: number | null }
    >();
    for (const row of newMarketRows ?? []) {
      if (!row.product_id) continue;
      const current = newMarketByProduct.get(row.product_id) ?? {
        activeListingCount: 0,
        lowestListingPriceCents: null,
      };
      current.activeListingCount += Number(row.active_ask_count ?? 0);
      if (
        row.lowest_ask_cents != null &&
        (current.lowestListingPriceCents == null ||
          row.lowest_ask_cents < current.lowestListingPriceCents)
      ) {
        current.lowestListingPriceCents = row.lowest_ask_cents;
      }
      newMarketByProduct.set(row.product_id, current);
    }

    const resortCodeById = new Map((resortRows ?? []).map((resort) => [resort.id, resort.code]));
    const allCatalogCards: ProductCard[] = (newRows ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      categoryName: (r.categories as { name: string } | null)?.name ?? null,
      categorySlug: (r.categories as { slug: string } | null)?.slug ?? null,
      collectionName: (r.collections as { name: string } | null)?.name ?? null,
      releaseDate: r.release_date,
      releaseType: r.release_type,
      retailPriceCents: r.retail_price_cents,
      currency: r.retail_price_currency,
      activeListingCount: newMarketByProduct.get(r.id)?.activeListingCount ?? 0,
      lowestListingPriceCents: newMarketByProduct.get(r.id)?.lowestListingPriceCents ?? null,
      isDemo: r.is_demo,
      variantCount: 0,
      resortCodes: (productLinks ?? [])
        .filter((link) => link.product_id === r.id)
        .map((link) => resortCodeById.get(link.resort_id))
        .filter((code): code is string => Boolean(code))
        .sort(),
      primaryImage:
        catalogImages({ id: r.id, slug: r.slug, name: r.name }, newImageRows ?? [])[0] ?? null,
    }));

    const categories: CategorySummary[] = (categoryRows ?? [])
      .map((category) => ({
        slug: category.slug,
        name: category.name,
        productCount: totalByCategory.get(category.id) ?? 0,
        image:
          allCatalogCards.find(
            (product) => product.categorySlug === category.slug && product.primaryImage,
          )?.primaryImage ?? null,
      }))
      .filter((category) => category.productCount > 0);

    const take = (predicate: (product: ProductCard) => boolean) =>
      allCatalogCards.filter((product) => product.primaryImage && predicate(product)).slice(0, 8);
    const merchandiseShelves: MerchandiseShelf[] = [
      {
        slug: "halloween",
        title: "Halloween in the parks",
        description: "Seasonal releases, party exclusives and spooky collectibles",
        browseSearch: { q: "Halloween" },
        products: take(
          (product) =>
            `${product.name} ${product.collectionName ?? ""}`
              .toLowerCase()
              .match(/halloween|oogie|hocus|nightmare|haunted/) != null,
        ),
      },
      {
        slug: "bags",
        title: "Bags & backpacks",
        description: "Park bags, character styles and wearable collectibles",
        browseSearch: { category: "bags" },
        products: take((product) => product.categorySlug === "bags"),
      },
      {
        slug: "headwear",
        title: "Ears & headwear",
        description: "Event ears, anniversary hats and park headbands",
        browseSearch: { category: "ears-headwear" },
        products: take((product) => product.categorySlug === "ears-headwear"),
      },
      {
        slug: "apparel",
        title: "Apparel",
        description: "Jackets, hoodies, tees and park-exclusive layers",
        browseSearch: { category: "apparel" },
        products: take((product) => product.categorySlug === "apparel"),
      },
      {
        slug: "novelty",
        title: "Popcorn buckets & sippers",
        description: "The character novelties guests carry out of the parks",
        browseSearch: { category: "popcorn-buckets-sippers" },
        products: take((product) => product.categorySlug === "popcorn-buckets-sippers"),
      },
      {
        slug: "disneyland",
        title: "Disneyland finds",
        description: "Merchandise tracked to Disneyland Resort",
        browseSearch: { resort: "DLR" },
        products: take((product) => product.resortCodes.includes("DLR")),
      },
      {
        slug: "disney-world",
        title: "Walt Disney World finds",
        description: "Merchandise tracked to Walt Disney World Resort",
        browseSearch: { resort: "WDW" },
        products: take((product) => product.resortCodes.includes("WDW")),
      },
    ].filter((shelf) => shelf.products.length > 0);

    // Until real weekly activity is available, rotate a stable random selection
    // every Monday while preserving the category mix.
    const topThisWeek = selectWeeklyTopTen(
      allCatalogCards.filter((product) => product.primaryImage),
    );

    const availabilityWord: Record<string, string> = {
      in_stock: "On the shelf",
      limited: "Only a few left",
      sold_out: "Sold out at this location",
    };

    return {
      resorts,
      categories,
      newToCatalog: allCatalogCards.slice(0, 8),
      topThisWeek,
      merchandiseShelves,
      lowestAsks: dedupe(
        (askRows ?? []).map((r) =>
          card(
            r.variant_id,
            "Lowest price",
            r.lowest_ask_cents,
            "USD",
            r.active_ask_count && r.active_ask_count > 1
              ? `${r.active_ask_count} active listings`
              : null,
          ),
        ),
      ),
      sourcingOffers: dedupe(
        (offerRows ?? []).map((r) =>
          card(
            r.variant_id,
            "Available to source from",
            r.price_cents,
            r.currency,
            r.fulfillment_window_days ? `${r.fulfillment_window_days}-day sourcing window` : null,
          ),
        ),
      ),
      recentlySighted: dedupe(
        (sightingRows ?? []).map((r) =>
          card(
            r.variant_id,
            "Reported in park",
            r.price_cents,
            r.currency,
            [r.location_name, availabilityWord[r.availability ?? ""] ?? null]
              .filter(Boolean)
              .join(" · ") || null,
          ),
        ),
      ),
      verifiedSales: dedupe(
        (saleRows ?? []).map((r) =>
          card(r.variant_id, "Last verified sale", r.price_cents, r.currency, null),
        ),
      ),
      catalogSize: catalogCount ?? 0,
    };
  },
);

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase JSON RPC output is untyped until linked types are regenerated */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/**
 * Administrator catalog console service boundary.
 *
 * Every mutation runs through an admin-gated SECURITY DEFINER database
 * function that derives the actor from `auth.uid()` and writes an append-only
 * audit entry. No fabricated market activity is created here: an operator adds
 * canonical catalog pages and reviews member submissions only.
 */

type ProductStatus = Database["public"]["Enums"]["product_status"];
type ReleaseType = Database["public"]["Enums"]["release_type"];
type SuggestionStatus = Database["public"]["Enums"]["suggestion_status"];

export type AdminCatalogOptions = {
  isAdmin: boolean;
  categories: { id: string; name: string; slug: string }[];
  resorts: { code: string; name: string }[];
};

export type AdminSuggestionRow = {
  id: string;
  name: string;
  brandText: string | null;
  collectionText: string | null;
  categoryId: string | null;
  resortCodes: string[];
  releaseNotes: string | null;
  proposedVariations: string | null;
  status: string;
  reviewerNote: string | null;
  createdProductId: string | null;
  createdAt: string;
  listingRequest: {
    priceCents: number;
    itemCondition: string;
    sellerNote: string | null;
    status: string;
    listingImageUrls: string[];
    evidenceImageUrls: string[];
  } | null;
};

export type AdminAskRow = {
  id: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  priceCents: number;
  itemCondition: string;
  inHand: boolean;
  evidenceCount: number;
  publicMediaCount: number;
  sellerDisplayName: string;
  sellerHandle: string;
  sellerNote: string | null;
  listingImageUrls: string[];
  evidenceImageUrls: string[];
  approvedAt: string | null;
  createdAt: string;
};

type AdminAskRpcRow = {
  ask_id: string;
  product_name: string;
  product_slug: string;
  variant_label: string;
  price_cents: number;
  item_condition: string;
  in_hand: boolean;
  evidence_count: number;
  public_media_count: number;
  seller_display_name: string;
  seller_handle: string;
  seller_note: string | null;
  listing_media_paths: string[] | null;
  evidence_paths: string[] | null;
  approved_at: string | null;
  created_at: string;
};

async function signedAdminUrls(bucket: string, paths: string[] | null): Promise<string[]> {
  if (!paths?.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  if (error) return [];
  return (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

export const getAdminCatalogConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return {
        isAdmin: false,
        categories: [],
        resorts: [],
        suggestions: [] as AdminSuggestionRow[],
        asks: [] as AdminAskRow[],
      };
    }

    const [categories, resorts, suggestions, asks] = await Promise.all([
      supabase.from("categories").select("id, name, slug").order("position"),
      supabase.from("resorts").select("code, name").eq("active", true).order("position"),
      supabase.rpc("admin_suggestion_queue"),
      supabase.rpc("admin_ask_review_queue"),
    ]);

    const askRows = (asks.data ?? []) as unknown as AdminAskRpcRow[];
    const suggestionRows = suggestions.data ?? [];
    const suggestionIds = suggestionRows.map((row) => row.suggestion_id);
    const client = supabase as any;
    const { data: heldListingRows } = suggestionIds.length
      ? await client
          .from("seller_listing_requests")
          .select(
            "suggestion_id,price_cents,item_condition,seller_note,status,public_media_paths,evidence_paths",
          )
          .in("suggestion_id", suggestionIds)
      : { data: [] };
    const heldBySuggestion = new Map(
      (heldListingRows ?? []).map((row: any) => [row.suggestion_id as string, row]),
    );

    return {
      isAdmin: true,
      categories: categories.data ?? [],
      resorts: resorts.data ?? [],
      suggestions: await Promise.all(
        suggestionRows.map(async (s) => {
          const held = heldBySuggestion.get(s.suggestion_id) as any;
          return {
            id: s.suggestion_id,
            name: s.name,
            brandText: s.brand_text,
            collectionText: s.collection_text,
            categoryId: s.category_id,
            resortCodes: s.resort_codes ?? [],
            releaseNotes: s.release_notes,
            proposedVariations: s.proposed_variations,
            status: s.status,
            reviewerNote: s.reviewer_note,
            createdProductId: s.created_product_id,
            createdAt: s.created_at,
            listingRequest: held
              ? {
                  priceCents: Number(held.price_cents),
                  itemCondition: held.item_condition,
                  sellerNote: held.seller_note,
                  status: held.status,
                  listingImageUrls: await signedAdminUrls("listing-media", held.public_media_paths),
                  evidenceImageUrls: await signedAdminUrls("ask-evidence", held.evidence_paths),
                }
              : null,
          };
        }),
      ),
      asks: await Promise.all(
        askRows.map(async (a) => ({
          id: a.ask_id,
          productName: a.product_name,
          productSlug: a.product_slug,
          variantLabel: a.variant_label,
          priceCents: a.price_cents,
          itemCondition: a.item_condition,
          inHand: a.in_hand,
          evidenceCount: a.evidence_count,
          publicMediaCount: a.public_media_count,
          sellerDisplayName: a.seller_display_name,
          sellerHandle: a.seller_handle,
          sellerNote: a.seller_note,
          listingImageUrls: await signedAdminUrls("listing-media", a.listing_media_paths),
          evidenceImageUrls: await signedAdminUrls("ask-evidence", a.evidence_paths),
          approvedAt: a.approved_at,
          createdAt: a.created_at,
        })),
      ),
    };
  });

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      slug?: string | null;
      categoryId: string;
      resortCodes: string[];
      variations?: string[] | null;
      brandText?: string | null;
      collectionText?: string | null;
      description?: string | null;
      releaseType?: string | null;
      releaseDate?: string | null;
      retailPriceCents?: number | null;
      retailPriceSource?: string | null;
      status?: string | null;
      suggestionId?: string | null;
    }) => {
      const name = String(input.name ?? "").trim();
      if (name.length < 3) throw new Error("Give the product a name of at least 3 characters.");
      const categoryId = String(input.categoryId ?? "").trim();
      if (!categoryId) throw new Error("Choose a catalog category.");
      const resortCodes = (input.resortCodes ?? [])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean);
      if (resortCodes.length === 0) throw new Error("Choose at least one resort.");
      const statuses: ProductStatus[] = [
        "draft",
        "pending_review",
        "published",
        "rejected",
        "archived",
      ];
      const status = (input.status ?? "draft") as ProductStatus;
      if (!statuses.includes(status)) throw new Error("Choose a valid catalog status.");
      const releaseTypes: ReleaseType[] = [
        "open_edition",
        "limited_edition",
        "limited_release",
        "seasonal",
        "event_exclusive",
        "annual_passholder",
        "unknown",
      ];
      const releaseType = (input.releaseType ?? "unknown") as ReleaseType;
      if (!releaseTypes.includes(releaseType)) throw new Error("Choose a valid release type.");
      const retail = Number(input.retailPriceCents ?? 0);
      if (
        input.retailPriceCents != null &&
        (!Number.isFinite(retail) || retail < 0 || retail > 500000)
      ) {
        throw new Error("Enter a realistic retail price.");
      }

      return {
        name,
        slug: String(input.slug ?? "").trim() || name,
        categoryId,
        resortCodes,
        variations: (input.variations ?? [])
          .map((v) => String(v).trim())
          .filter(Boolean)
          .slice(0, 40),
        brandText: String(input.brandText ?? "").trim() || null,
        collectionText: String(input.collectionText ?? "").trim() || null,
        description: String(input.description ?? "").trim() || null,
        releaseType,
        releaseDate: String(input.releaseDate ?? "").trim() || null,
        retailPriceCents: input.retailPriceCents != null ? Math.round(retail) : null,
        retailPriceSource: String(input.retailPriceSource ?? "").trim() || null,
        status,
        suggestionId: String(input.suggestionId ?? "").trim() || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: productId, error } = await context.supabase.rpc("admin_create_product", {
      _name: data.name,
      _slug: data.slug,
      _category_id: data.categoryId,
      _resort_codes: data.resortCodes,
      _release_type: data.releaseType,
      _status: data.status,
      ...(data.variations.length ? { _variations: data.variations } : {}),
      ...(data.brandText ? { _brand_text: data.brandText } : {}),
      ...(data.collectionText ? { _collection_text: data.collectionText } : {}),
      ...(data.description ? { _description: data.description } : {}),
      ...(data.releaseDate ? { _release_date: data.releaseDate } : {}),
      ...(data.retailPriceCents != null ? { _retail_price_cents: data.retailPriceCents } : {}),
      ...(data.retailPriceSource ? { _retail_price_source: data.retailPriceSource } : {}),
      ...(data.suggestionId ? { _suggestion_id: data.suggestionId } : {}),
    });
    if (error) throw new Error(error.message);
    return { productId: productId as string };
  });

export const adminReviewSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { suggestionId: string; status: string; note?: string | null }) => {
    const allowed: SuggestionStatus[] = ["in_review", "rejected", "merged_duplicate"];
    const status = input.status as SuggestionStatus;
    if (!allowed.includes(status)) {
      throw new Error("Approve a request by creating its catalog page instead.");
    }
    return {
      suggestionId: String(input.suggestionId),
      status,
      note: String(input.note ?? "").trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_review_product_suggestion", {
      _suggestion_id: data.suggestionId,
      _status: data.status,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateAskPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string; priceCents: number; note?: string | null }) => {
    const priceCents = Math.round(Number(input.priceCents));
    if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 1000000000) {
      throw new Error("Enter a realistic listing price.");
    }
    return {
      askId: String(input.askId),
      priceCents,
      note: String(input.note ?? "").trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_update_ask_price", {
      _ask_id: data.askId,
      _price_cents: data.priceCents,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminReviewAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string; approve: boolean; note?: string | null }) => ({
    askId: String(input.askId),
    approve: Boolean(input.approve),
    note: String(input.note ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_review_ask", {
      _ask_id: data.askId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    const { emailListingReviewed } = await import("./email-notifications.server");
    await emailListingReviewed(data.askId, data.approve, data.note);
    if (data.approve) {
      const { processSavedSearchAlerts } = await import("./saved-search-worker.server");
      void processSavedSearchAlerts(data.askId);
    }
    return { ok: true as const };
  });

/* ---------- Editing existing catalog pages ---------- */

export type AdminProductSearchRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDemo: boolean;
  variantCount: number;
  imageCount: number;
  updatedAt: string;
};

export type AdminProductDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDemo: boolean;
  categoryId: string | null;
  brandText: string | null;
  collectionText: string | null;
  description: string | null;
  releaseType: string;
  releaseDate: string | null;
  retailPriceCents: number | null;
  retailPriceSource: string | null;
  resortCodes: string[];
  variants: {
    id: string;
    label: string | null;
    size: string | null;
    color: string | null;
    edition: string | null;
    position: number;
    active: boolean;
  }[];
  images: {
    id: string;
    alt: string | null;
    position: number;
    storagePath: string;
    viewRole: string;
  }[];
};

export const adminSearchProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query?: string | null }) => ({
    query: String(input?.query ?? "")
      .trim()
      .slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_product_search", {
      ...(data.query ? { _query: data.query } : {}),
      _limit: 40,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.product_id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      isDemo: r.is_demo,
      variantCount: r.variant_count,
      imageCount: r.image_count,
      updatedAt: r.updated_at,
    })) satisfies AdminProductSearchRow[];
  });

export const adminGetProductDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => ({ productId: String(input.productId) }))
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase.rpc("admin_product_detail", {
      _product_id: data.productId,
    });
    if (error) throw new Error(error.message);
    const d = (raw ?? {}) as Record<string, any>;
    return {
      id: d["id"],
      name: d["name"],
      slug: d["slug"],
      status: d["status"],
      isDemo: Boolean(d["is_demo"]),
      categoryId: d["category_id"] ?? null,
      brandText: d["brand_text"] ?? null,
      collectionText: d["collection_text"] ?? null,
      description: d["description"] ?? null,
      releaseType: d["release_type"] ?? "unknown",
      releaseDate: d["release_date"] ?? null,
      retailPriceCents: d["retail_price_cents"] ?? null,
      retailPriceSource: d["retail_price_source"] ?? null,
      resortCodes: (d["resort_codes"] ?? []) as string[],
      variants: ((d["variants"] ?? []) as Record<string, any>[]).map((v) => ({
        id: v["id"],
        label: v["label"] ?? null,
        size: v["size"] ?? null,
        color: v["color"] ?? null,
        edition: v["edition"] ?? null,
        position: Number(v["position"] ?? 0),
        active: Boolean(v["active"]),
      })),
      images: ((d["images"] ?? []) as Record<string, any>[]).map((i) => ({
        id: i["id"],
        alt: i["alt"] ?? null,
        position: Number(i["position"] ?? 0),
        storagePath: i["storage_path"],
        viewRole: i["view_role"] ?? "gallery",
      })),
    } satisfies AdminProductDetail;
  });

export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      productId: string;
      name: string;
      slug?: string | null;
      categoryId: string;
      resortCodes: string[];
      brandText?: string | null;
      collectionText?: string | null;
      description?: string | null;
      releaseType?: string | null;
      releaseDate?: string | null;
      retailPriceCents?: number | null;
      retailPriceSource?: string | null;
      status?: string | null;
    }) => {
      const name = String(input.name ?? "").trim();
      if (name.length < 3) throw new Error("Give the product a name of at least 3 characters.");
      const categoryId = String(input.categoryId ?? "").trim();
      if (!categoryId) throw new Error("Choose a catalog category.");
      const resortCodes = (input.resortCodes ?? [])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean);
      if (resortCodes.length === 0) throw new Error("Choose at least one resort.");
      const statuses: ProductStatus[] = [
        "draft",
        "pending_review",
        "published",
        "rejected",
        "archived",
      ];
      const status = (input.status ?? "draft") as ProductStatus;
      if (!statuses.includes(status)) throw new Error("Choose a valid catalog status.");
      const releaseTypes: ReleaseType[] = [
        "open_edition",
        "limited_edition",
        "limited_release",
        "seasonal",
        "event_exclusive",
        "annual_passholder",
        "unknown",
      ];
      const releaseType = (input.releaseType ?? "unknown") as ReleaseType;
      if (!releaseTypes.includes(releaseType)) throw new Error("Choose a valid release type.");
      const retail = Number(input.retailPriceCents ?? 0);
      if (
        input.retailPriceCents != null &&
        (!Number.isFinite(retail) || retail < 0 || retail > 500000)
      ) {
        throw new Error("Enter a realistic retail price.");
      }
      return {
        productId: String(input.productId),
        name,
        slug: String(input.slug ?? "").trim() || name,
        categoryId,
        resortCodes,
        brandText: String(input.brandText ?? "").trim() || null,
        collectionText: String(input.collectionText ?? "").trim() || null,
        description: String(input.description ?? "").trim() || null,
        releaseType,
        releaseDate: String(input.releaseDate ?? "").trim() || null,
        retailPriceCents: input.retailPriceCents != null ? Math.round(retail) : null,
        retailPriceSource: String(input.retailPriceSource ?? "").trim() || null,
        status,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_update_product", {
      _product_id: data.productId,
      _name: data.name,
      _slug: data.slug,
      _category_id: data.categoryId,
      _resort_codes: data.resortCodes,
      _release_type: data.releaseType,
      _status: data.status,
      ...(data.brandText ? { _brand_text: data.brandText } : {}),
      ...(data.collectionText ? { _collection_text: data.collectionText } : {}),
      ...(data.description ? { _description: data.description } : {}),
      ...(data.releaseDate ? { _release_date: data.releaseDate } : {}),
      ...(data.retailPriceCents != null ? { _retail_price_cents: data.retailPriceCents } : {}),
      ...(data.retailPriceSource ? { _retail_price_source: data.retailPriceSource } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminSaveVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      productId: string;
      variantId?: string | null;
      label: string;
      size?: string | null;
      color?: string | null;
      edition?: string | null;
      position?: number | null;
      active?: boolean;
    }) => {
      const label = String(input.label ?? "").trim();
      if (!label) throw new Error("Give the variation a label.");
      return {
        productId: String(input.productId),
        variantId: String(input.variantId ?? "").trim() || null,
        label,
        size: String(input.size ?? "").trim() || null,
        color: String(input.color ?? "").trim() || null,
        edition: String(input.edition ?? "").trim() || null,
        position:
          input.position != null && Number.isFinite(Number(input.position))
            ? Math.round(Number(input.position))
            : null,
        active: input.active !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_save_variant", {
      _product_id: data.productId,
      _label: data.label,
      _active: data.active,
      ...(data.variantId ? { _variant_id: data.variantId } : {}),
      ...(data.size ? { _size: data.size } : {}),
      ...(data.color ? { _color: data.color } : {}),
      ...(data.edition ? { _edition: data.edition } : {}),
      ...(data.position != null ? { _position: data.position } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUpdateProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      imageId: string;
      alt?: string | null;
      position?: number | null;
      storagePath?: string | null;
      viewRole?: string | null;
    }) => ({
      imageId: String(input.imageId),
      alt: String(input.alt ?? "").trim() || null,
      position:
        input.position != null && Number.isFinite(Number(input.position))
          ? Math.round(Number(input.position))
          : null,
      storagePath: String(input.storagePath ?? "").trim() || null,
      viewRole:
        String(input.viewRole ?? "").trim() === "spin"
          ? "spin"
          : String(input.viewRole ?? "").trim() === "gallery"
            ? "gallery"
            : null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_update_product_image", {
      _image_id: data.imageId,
      ...(data.alt ? { _alt: data.alt } : {}),
      ...(data.position != null ? { _position: data.position } : {}),
      ...(data.storagePath ? { _storage_path: data.storagePath } : {}),
      ...(data.viewRole ? { _view_role: data.viewRole } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminAddProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      productId: string;
      storagePath: string;
      alt?: string | null;
      position?: number | null;
      viewRole?: string | null;
    }) => {
      const storagePath = String(input.storagePath ?? "").trim();
      if (!storagePath) throw new Error("Upload or reference a photo first.");
      const viewRole = String(input.viewRole ?? "gallery").trim() === "spin" ? "spin" : "gallery";
      return {
        productId: String(input.productId),
        storagePath,
        alt: String(input.alt ?? "").trim() || null,
        position:
          input.position != null && Number.isFinite(Number(input.position))
            ? Math.round(Number(input.position))
            : null,
        viewRole,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_add_product_image", {
      _product_id: data.productId,
      _storage_path: data.storagePath,
      _view_role: data.viewRole,
      ...(data.alt ? { _alt: data.alt } : {}),
      ...(data.position != null ? { _position: data.position } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageId: string }) => ({ imageId: String(input.imageId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_delete_product_image", {
      _image_id: data.imageId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

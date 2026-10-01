/* eslint-disable @typescript-eslint/no-explicit-any -- the generated client types lag the classified listing RPC additions */
import { createServerFn } from "@tanstack/react-start";

import { publicServerClient } from "./supabase-public.server";
import { classifiedCategories } from "@/config/classifieds";
import { normalizePetSpecies, normalizePetSubcategory } from "@/config/pets";
import { normalizeClassifiedItemDetails } from "@/config/classified-item-fields";
import { formatUsd } from "@/config/fees";
import {
  mockClassifiedListings,
  mockVehicleListings,
  homeCommunities,
  type ClassifiedFloorplan,
  type ClassifiedHomeDetails,
  type ClassifiedJobDetails,
  type ClassifiedPetDetails,
  type ClassifiedServiceDetails,
} from "@/config/classified-mocks";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifiedListingSchema,
  type ClassifiedListingInput,
} from "@/lib/classified-listing-contracts";
import {
  comparableJobPay,
  isInvertedRange,
  matchesLeaseLength,
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
} from "@/lib/classifieds-query";

/**
 * Public read layer for individual classified listings.
 *
 * Every classified is one seller listing (`asks` row) with its own private
 * product/variant adapter plus a `classified_listing_details` record. Nothing
 * here pools sellers together: one row in, one listing out. Reads go through
 * the anon publishable client so row-level security decides what is visible —
 * only approved, active, non-demo listings on published products.
 */

export type ClassifiedVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  bodyStyle: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  exteriorColor: string | null;
  titleStatus: string | null;
  vin: string | null;
};

export type ClassifiedPet = ClassifiedPetDetails;

export type ClassifiedCard = {
  id: string;
  title: string;
  productId: string;
  productSlug: string;
  priceCents: number;
  currency: string;
  city: string;
  state: string;
  region: string;
  categorySlug: string | null;
  categoryName: string | null;
  condition: string;
  fulfillmentMode: string;
  createdAt: string;
  isFeatured: boolean;
  imageUrl: string | null;
  vehicle: ClassifiedVehicle | null;
  pet?: ClassifiedPet | null;
  home?: ClassifiedHomeDetails | null;
  job?: ClassifiedJobDetails | null;
  service?: ClassifiedServiceDetails | null;
  isMock?: boolean;
  listingNumber?: string;
  itemDetails?: Record<string, string>;
  dealer?: {
    displayName: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export type ClassifiedDetail = ClassifiedCard & {
  description: string | null;
  postalCode: string | null;
  expiresAt: string | null;
  sellerNote: string | null;
  variantId: string;
  seller: {
    userId?: string;
    slug: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    payoutVerified: boolean;
    ratingAverage: number | null;
    reviewCount: number;
    contactPhone?: string | null;
    contactTextPhone?: string | null;
    contactEmail?: string | null;
    allowInternalMessages?: boolean;
    memberSince?: number;
    sellerType?: string;
  } | null;
  images: { url: string; alt: string }[];
  communityListings?: ClassifiedCard[] | undefined;
  communityFloorplans?: ClassifiedFloorplan[] | undefined;
  employerListings?: ClassifiedCard[] | undefined;
};

export type ClassifiedBrowseResult = {
  listings: ClassifiedCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type ClassifiedCategoryOption = {
  id: string;
  slug: string;
  name: string;
};

export type ClassifiedListingReportInput = {
  listingId: string;
  reason: string;
  details?: string | null;
};

/** Members can report a public listing once; moderation staff review the queue. */
export const reportClassifiedListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ClassifiedListingReportInput) => {
    const listingId = String(input.listingId ?? "").trim();
    const reason = String(input.reason ?? "").trim();
    const details = input.details == null ? null : String(input.details).trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)
    ) {
      throw new Error("Listing not found.");
    }
    if (reason.length < 2 || reason.length > 80) throw new Error("Choose a report reason.");
    if (details && details.length > 500) throw new Error("Keep the details under 500 characters.");
    return { listingId, reason, details: details || null };
  })
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: listing, error: listingError } = await client
      .from("asks")
      .select("id")
      .eq("id", data.listingId)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (listingError) throw new Error(listingError.message);
    if (!listing) throw new Error("That listing is no longer available.");

    const { error } = await client.from("classified_listing_reports").insert({
      listing_id: data.listingId,
      reporter_id: context.userId,
      reason: data.reason,
      details: data.details,
    });
    if (error?.code === "23505") return { alreadyReported: true as const };
    if (error) throw new Error(error.message);
    return { alreadyReported: false as const };
  });

export type AdminClassifiedReport = {
  id: string;
  listingId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

export const getAdminClassifiedReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean; reports: AdminClassifiedReport[] }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) return { isAdmin: false, reports: [] };
    const client = context.supabase as any;
    const { data, error } = await client
      .from("classified_listing_reports")
      .select("id,listing_id,reason,details,status,created_at")
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      isAdmin: true,
      reports: (data ?? []).map((row: any) => ({
        id: row.id,
        listingId: row.listing_id,
        reason: row.reason,
        details: row.details ?? null,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at ?? null,
      })),
    };
  });

export const resolveAdminClassifiedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      reportId: string;
      action: "assign" | "reviewed" | "dismissed";
      note?: string | null;
    }) => {
      if (input.action !== "assign" && input.action !== "reviewed" && input.action !== "dismissed")
        throw new Error("Choose a report resolution.");
      const note = input.note == null ? null : String(input.note).trim();
      if (note && note.length > 1000) throw new Error("Keep the note under 1,000 characters.");
      return { reportId: String(input.reportId), action: input.action, note: note || null };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc(
      "admin_update_classified_listing_report",
      {
        _report_id: data.reportId,
        _action: data.action,
        _note: data.note,
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getClassifiedCategoryOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClassifiedCategoryOption[]> => {
    const client = publicServerClient();
    const slugs = classifiedCategories.map((category) => category.slug);
    const { data, error } = await client
      .from("categories")
      .select("id, slug, name")
      .in("slug", slugs)
      .order("position");
    if (error) throw new Error(error.message);
    return (data ?? []) as ClassifiedCategoryOption[];
  },
);

export type AdminClassifiedRow = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  condition: string;
  categoryName: string;
  city: string;
  state: string;
  region: string;
  fulfillmentMode: string;
  itemDetails: Record<string, string>;
  sellerDisplayName: string;
  sellerHandle: string;
  sellerNote: string | null;
  vehicle: ClassifiedVehicle | null;
  pet?: ClassifiedPet | null;
  listingImageUrls: string[];
  evidenceImageUrls: string[];
  createdAt: string;
};

/** Admin-only queue for the actual classified listings awaiting moderation. */
export const getAdminClassifiedQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as any;
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) return { isAdmin: false, listings: [] as AdminClassifiedRow[] };

    const { data: rawRows, error: queueError } =
      await context.supabase.rpc("admin_ask_review_queue");
    if (queueError) throw new Error(queueError.message);
    const rows = (rawRows ?? []) as Array<{
      ask_id: string;
      product_name: string;
      price_cents: number;
      item_condition: string;
      seller_display_name: string;
      seller_handle: string;
      seller_note: string | null;
      listing_media_paths: string[] | null;
      evidence_paths: string[] | null;
      created_at: string;
    }>;
    if (rows.length === 0) return { isAdmin: true, listings: [] as AdminClassifiedRow[] };

    const listingIds = rows.map((row) => row.ask_id);
    const { data: detailRows, error: detailsError } = await client
      .from("classified_listing_details")
      .select(
        "listing_id,region,city,state,fulfillment_mode,item_details,vehicle_make,vehicle_model,vehicle_year,vehicle_trim,vehicle_mileage,vehicle_body_style,vehicle_transmission,vehicle_drivetrain,vehicle_fuel_type,vehicle_exterior_color,vehicle_title_status,vin,pet_subcategory,pet_species,pet_breed,pet_name,pet_age,pet_sex,pet_placement_type,pet_offered_by,pet_hypoallergenic,pet_vaccinated,pet_spayed_neutered,pet_microchipped,pet_records_available,pet_good_with_kids,pet_good_with_dogs,pet_good_with_cats,pet_indoor_outdoor,pet_special_needs,pet_breeding_terms,asks!inner(products!inner(categories(name,slug)))",
      )
      .in("listing_id", listingIds);
    if (detailsError) throw new Error(detailsError.message);

    const detailsByListing = new Map(
      ((detailRows ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row["listing_id"]),
        row,
      ]),
    );
    const { data: productRows, error: productError } = await client
      .from("asks")
      .select("id,products(description)")
      .in("id", listingIds);
    if (productError) throw new Error(productError.message);
    const descriptionByListing = new Map(
      (productRows ?? []).map((row: any) => [
        row.id as string,
        String(row.products?.description ?? ""),
      ]),
    );
    const listings = await Promise.all(
      rows.map(async (row) => {
        const details = detailsByListing.get(row.ask_id);
        if (!details) return null;
        const category = details["asks"] as {
          products?: { categories?: { name?: string; slug?: string } };
        } | null;
        return {
          id: row.ask_id,
          title: row.product_name,
          description: descriptionByListing.get(row.ask_id) ?? "",
          priceCents: Number(row.price_cents),
          condition: row.item_condition,
          categoryName: category?.products?.categories?.name ?? "Classified",
          city: String(details["city"] ?? ""),
          state: String(details["state"] ?? "ID").toUpperCase(),
          region: String(details["region"] ?? ""),
          fulfillmentMode: String(details["fulfillment_mode"] ?? ""),
          itemDetails: normalizeClassifiedItemDetails(
            String(
              (category?.products?.categories as { slug?: string } | undefined)?.slug ?? "general",
            ),
            (details["item_details"] as Record<string, unknown> | null) ?? {},
          ),
          sellerDisplayName: row.seller_display_name,
          sellerHandle: row.seller_handle,
          sellerNote: row.seller_note,
          vehicle: vehicleOf(details),
          pet: petOf(details),
          listingImageUrls: await signedAdminUrls("listing-media", row.listing_media_paths),
          evidenceImageUrls: await signedAdminUrls("ask-evidence", row.evidence_paths),
          createdAt: row.created_at,
        } satisfies AdminClassifiedRow;
      }),
    );

    return {
      isAdmin: true,
      listings: listings.filter(Boolean) as AdminClassifiedRow[],
    };
  });

export type CreateClassifiedListingInput = ClassifiedListingInput & {
  parcelLengthIn?: number | null;
  parcelWidthIn?: number | null;
  parcelHeightIn?: number | null;
  parcelWeightLb?: number | null;
  evidencePaths: string[];
  publicMediaPaths: string[];
};

export const createClassifiedListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateClassifiedListingInput): CreateClassifiedListingInput => {
    const parsed = classifiedListingSchema.parse(input);
    const positive = (value: number | null | undefined) =>
      value == null || (Number.isFinite(value) && value > 0) ? (value ?? null) : null;
    const evidencePaths = (input.evidencePaths ?? []).filter(Boolean).slice(0, 8);
    const publicMediaPaths = (input.publicMediaPaths ?? []).filter(Boolean).slice(0, 8);
    if (evidencePaths.length === 0 || publicMediaPaths.length === 0)
      throw new Error("Add at least one exact-item photo.");
    return {
      ...parsed,
      state: parsed.state.toUpperCase(),
      evidencePaths,
      publicMediaPaths,
      parcelLengthIn: positive(input.parcelLengthIn),
      parcelWidthIn: positive(input.parcelWidthIn),
      parcelHeightIn: positive(input.parcelHeightIn),
      parcelWeightLb: positive(input.parcelWeightLb),
    };
  })
  .handler(async ({ data, context }): Promise<{ listingId: string }> => {
    const client = context.supabase as any;
    const { data: category, error: categoryError } = await client
      .from("categories")
      .select("id")
      .eq("slug", data.category)
      .maybeSingle();
    if (categoryError) throw new Error(categoryError.message);
    if (!category?.id) throw new Error("Choose a valid classified category.");

    const rpcName =
      data.category === "pets" && data.priceCents === 0
        ? "create_free_pet_listing"
        : "create_classified_listing";
    const { data: listingId, error } = await client.rpc(rpcName, {
      _title: data.title,
      _description: data.description,
      _category_id: category.id,
      _price_cents: data.priceCents,
      _item_condition: data.condition,
      _seller_note: data.sellerNote ?? null,
      _region: data.region,
      _city: data.city,
      _state: data.state,
      _postal_code: data.postalCode ?? null,
      _fulfillment_mode: data.fulfillmentMode,
      _parcel_length_in: data.parcelLengthIn ?? null,
      _parcel_width_in: data.parcelWidthIn ?? null,
      _parcel_height_in: data.parcelHeightIn ?? null,
      _parcel_weight_lb: data.parcelWeightLb ?? null,
      _evidence_paths: data.evidencePaths,
      _public_media_paths: data.publicMediaPaths,
      _vehicle: vehicleForRpc(data.vehicle),
      _home: homeForRpc(data.home),
      _job: jobForRpc(data.job),
      _service: serviceForRpc(data.service),
      _pet: petForRpc(data.pet),
    });
    if (error) throw new Error(error.message);
    const itemDetails = normalizeClassifiedItemDetails(data.category, data.itemDetails);
    const { error: itemDetailsError } = await client
      .from("classified_listing_details")
      .update({ item_details: itemDetails })
      .eq("listing_id", listingId);
    if (itemDetailsError) throw new Error(itemDetailsError.message);
    return { listingId: listingId as string };
  });

export type ClassifiedListingEditor = {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  condition: string;
  sellerNote: string;
  itemDetails: Record<string, string>;
  state: string;
  region: string;
  city: string;
  postalCode: string;
  fulfillmentMode: string;
  vehicle: ClassifiedVehicle | null;
  pet: ClassifiedPet | null;
  home: ClassifiedHomeDetails | null;
  job: ClassifiedJobDetails | null;
  service: ClassifiedServiceDetails | null;
  parcelLengthIn: string;
  parcelWidthIn: string;
  parcelHeightIn: string;
  parcelWeightLb: string;
  status: string;
  approvedAt: string | null;
  imageUrls: string[];
};

const EDITOR_DETAILS_SELECT =
  "state,region,city,postal_code,fulfillment_mode,item_details,vehicle_make,vehicle_model,vehicle_year,vehicle_trim,vehicle_mileage,vehicle_body_style,vehicle_transmission,vehicle_drivetrain,vehicle_fuel_type,vehicle_exterior_color,vehicle_title_status,vin," +
  "home_mode,home_property_type,home_bedrooms,home_bathrooms,home_square_feet,home_year_built,home_acreage,home_heating,home_cooling,home_garage_parking,home_yard,home_appliances_included,home_floor_coverings,home_basement_type,home_exterior_material,home_special_features,home_hoa_fees,home_school_district,home_lease_length,home_available,home_pets_policy,home_smoking_policy,home_open_house," +
  "job_category,job_employer_name,job_employer_address,job_pay_type,job_pay_min,job_pay_max,job_employment_type,job_experience_required,job_education_level,job_responsibilities,job_qualifications," +
  "service_subcategory,service_area,service_availability,service_business_address,service_license_number,service_license_lookup_url,service_offerings,service_pricing_type,service_price_max_cents," +
  "pet_subcategory,pet_species,pet_breed,pet_name,pet_age,pet_sex,pet_placement_type,pet_offered_by,pet_hypoallergenic,pet_vaccinated,pet_spayed_neutered,pet_microchipped,pet_records_available,pet_good_with_kids,pet_good_with_dogs,pet_good_with_cats,pet_indoor_outdoor,pet_special_needs,pet_breeding_terms";

export const getClassifiedListingEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string }) => ({ listingId: String(input.listingId) }))
  .handler(async ({ data, context }): Promise<ClassifiedListingEditor | null> => {
    // Seller edit/duplicate reads need the complete private details and media
    // graph. Read through the server client after scoping the ask to the
    // authenticated seller so a restrictive child-table policy cannot turn an
    // owned listing into a misleading "not found" state.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as any;
    const { data: row, error } = await client
      .from("asks")
      .select(
        `id,status,approved_at,price_cents,item_condition,seller_note,parcel_length_in,parcel_width_in,parcel_height_in,parcel_weight_lb,products!inner(name,description,categories(slug)),classified_listing_details!inner(${EDITOR_DETAILS_SELECT}),listing_media(storage_path,position)`,
      )
      .eq("id", data.listingId)
      .eq("seller_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const record = row as any;
    const details = record.classified_listing_details as Record<string, unknown>;
    const media = ((record.listing_media ?? []) as { storage_path: string; position: number }[])
      .sort((a, b) => a.position - b.position)
      .map((item) => item.storage_path);
    const urls = await signListingMedia(media);
    const category = record.products?.categories?.slug ?? "general";
    const description = record.products?.description ?? "";
    return {
      id: record.id,
      title: record.products?.name ?? "",
      description,
      category,
      priceCents: Number(record.price_cents),
      condition: record.item_condition,
      sellerNote: record.seller_note ?? "",
      itemDetails: normalizeClassifiedItemDetails(
        category,
        (details["item_details"] as Record<string, unknown> | null) ?? {},
      ),
      state: String(details["state"] ?? "ID").toUpperCase(),
      region: String(details["region"] ?? ""),
      city: String(details["city"] ?? ""),
      postalCode: String(details["postal_code"] ?? ""),
      fulfillmentMode: String(details["fulfillment_mode"] ?? "local_pickup"),
      vehicle: vehicleOf(details),
      home: homeOf(details),
      job: jobOf(details, description),
      service: serviceOf(details, description, Number(record.price_cents)),
      pet: petOf(details),
      parcelLengthIn: record.parcel_length_in == null ? "" : String(record.parcel_length_in),
      parcelWidthIn: record.parcel_width_in == null ? "" : String(record.parcel_width_in),
      parcelHeightIn: record.parcel_height_in == null ? "" : String(record.parcel_height_in),
      parcelWeightLb: record.parcel_weight_lb == null ? "" : String(record.parcel_weight_lb),
      status: record.status,
      approvedAt: record.approved_at ?? null,
      imageUrls: media.map((path) => urls.get(path)).filter((url): url is string => Boolean(url)),
    };
  });

export type UpdateClassifiedListingInput = {
  listingId: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  condition: string;
  sellerNote?: string | undefined;
  state: string;
  region: string;
  city: string;
  postalCode?: string | undefined;
  fulfillmentMode: string;
  parcelLengthIn?: number | null;
  parcelWidthIn?: number | null;
  parcelHeightIn?: number | null;
  parcelWeightLb?: number | null;
  vehicle?: ClassifiedListingInput["vehicle"];
  home?: ClassifiedListingInput["home"];
  job?: ClassifiedListingInput["job"];
  service?: ClassifiedListingInput["service"];
  pet?: ClassifiedListingInput["pet"];
  itemDetails?: ClassifiedListingInput["itemDetails"];
  publicMediaPaths?: string[];
};

export const updateClassifiedListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateClassifiedListingInput): UpdateClassifiedListingInput => {
    const parsed = classifiedListingSchema.parse(input);
    return {
      ...parsed,
      listingId: String(input.listingId),
      publicMediaPaths: (input.publicMediaPaths ?? []).filter(Boolean).slice(0, 8),
      parcelLengthIn: input.parcelLengthIn ?? null,
      parcelWidthIn: input.parcelWidthIn ?? null,
      parcelHeightIn: input.parcelHeightIn ?? null,
      parcelWeightLb: input.parcelWeightLb ?? null,
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const client = context.supabase as any;
    const { data: category, error: categoryError } = await client
      .from("categories")
      .select("id")
      .eq("slug", data.category)
      .maybeSingle();
    if (categoryError) throw new Error(categoryError.message);
    if (!category?.id) throw new Error("Choose a valid classified category.");

    const rpcName =
      data.category === "pets" && data.priceCents === 0
        ? "update_free_pet_listing"
        : "update_classified_listing";
    const { error } = await client.rpc(rpcName, {
      _listing_id: data.listingId,
      _title: data.title,
      _description: data.description,
      _category_id: category.id,
      _price_cents: data.priceCents,
      _item_condition: data.condition,
      _seller_note: data.sellerNote ?? null,
      _region: data.region,
      _city: data.city,
      _state: data.state,
      _postal_code: data.postalCode ?? null,
      _fulfillment_mode: data.fulfillmentMode,
      _parcel_length_in: data.parcelLengthIn ?? null,
      _parcel_width_in: data.parcelWidthIn ?? null,
      _parcel_height_in: data.parcelHeightIn ?? null,
      _parcel_weight_lb: data.parcelWeightLb ?? null,
      _vehicle: vehicleForRpc(data.vehicle),
      _home: homeForRpc(data.home),
      _job: jobForRpc(data.job),
      _service: serviceForRpc(data.service),
      _pet: petForRpc(data.pet),
    });
    if (error) throw new Error(error.message);
    const itemDetails = normalizeClassifiedItemDetails(data.category, data.itemDetails);
    const { error: itemDetailsError } = await client
      .from("classified_listing_details")
      .update({ item_details: itemDetails })
      .eq("listing_id", data.listingId);
    if (itemDetailsError) throw new Error(itemDetailsError.message);
    if (data.publicMediaPaths && data.publicMediaPaths.length > 0) {
      const replaced = await client.rpc("replace_listing_media", {
        _ask_id: data.listingId,
        _paths: data.publicMediaPaths,
      });
      if (replaced.error) throw new Error(replaced.error.message);
    }
    return { ok: true };
  });

const PAGE_SIZE = 24;
const conditionValues = [
  "new_with_tags",
  "new_without_tags",
  "used_excellent",
  "used_good",
  "broken_needs_repairs",
] as const;

const LISTING_SELECT =
  "id, product_id, variant_id, seller_id, dealer_id, price_cents, currency, item_condition, seller_note, created_at, expires_at, featured_until, promoted_at, ranking_at, " +
  "products!inner(id, slug, name, description, status, category_id, categories(slug, name)), " +
  "dealer_profiles(display_name, slug, logo_url, city, state), " +
  "classified_listing_details!inner(region, city, state, postal_code, fulfillment_mode, item_details, vehicle_make, vehicle_model, vehicle_year, vehicle_trim, vehicle_mileage, vehicle_body_style, vehicle_transmission, vehicle_drivetrain, vehicle_fuel_type, vehicle_exterior_color, vehicle_title_status, vin, " +
  "home_mode, home_property_type, home_bedrooms, home_bathrooms, home_square_feet, home_year_built, home_acreage, home_acres, home_heating, home_cooling, home_garage_parking, home_yard, home_appliances_included, home_floor_coverings, home_basement_type, home_exterior_material, home_special_features, home_hoa_fees, home_school_district, home_lease_length, home_available, home_pets_policy, home_smoking_policy, home_open_house, " +
  "job_category, job_employer_name, job_employer_address, job_pay_type, job_pay_min, job_pay_max, job_employment_type, job_experience_required, job_education_level, job_responsibilities, job_qualifications, " +
  "service_subcategory, service_area, service_availability, service_business_address, service_license_number, service_license_lookup_url, service_offerings, service_pricing_type, service_price_max_cents, " +
  "pet_subcategory, pet_species, pet_breed, pet_name, pet_age, pet_sex, pet_placement_type, pet_offered_by, pet_hypoallergenic, pet_vaccinated, pet_spayed_neutered, pet_microchipped, pet_records_available, pet_good_with_kids, pet_good_with_dogs, pet_good_with_cats, pet_indoor_outdoor, pet_special_needs, pet_breeding_terms), " +
  "listing_media(storage_path, position)";

// These exact records were created for release verification. Keep a public
// read shield until the hosted database has applied the matching cleanup
// migration; normal seller listings are unaffected.
const RELEASE_QA_LISTING_NAMES = new Set([
  "mvp test cordless drill",
  "qa messaging test",
  "resend delivery qa",
  "qa pet listing - do not contact",
]);

function isReleaseQaListing(row: Record<string, unknown>) {
  const product = row["products"] as { name?: unknown } | null;
  return RELEASE_QA_LISTING_NAMES.has(
    String(product?.name ?? "")
      .trim()
      .toLowerCase(),
  );
}

/** PostgREST `or=` treats these as structural characters; escape them. */
function escapeFilterValue(value: string) {
  return value.replace(/[\\,.()]/g, "\\$&");
}

function applyReferencedFilter(query: any, field: string, values: string[]) {
  if (values.length === 1) return query.eq(`classified_listing_details.${field}`, values[0]);
  return query.or(values.map((value) => `${field}.eq.${escapeFilterValue(value)}`).join(","), {
    referencedTable: "classified_listing_details",
  });
}

function applyReferencedContains(query: any, field: string, value: string) {
  return query.ilike(`classified_listing_details.${field}`, `%${escapeLikeValue(value)}%`);
}

function applyReferencedContainsAny(query: any, field: string, value: string) {
  const values = filterValues(value);
  if (values.length <= 1) return applyReferencedContains(query, field, values[0] ?? value);
  return query.or(
    values.map((item) => `${field}.ilike.*${escapeFilterValue(escapeLikeValue(item))}*`).join(","),
    { referencedTable: "classified_listing_details" },
  );
}

function postedSince(value: ClassifiedBrowseInput["postedWithin"]) {
  if (!value) return undefined;
  const hours = value === "hour" ? 1 : value === "day" ? 24 : value === "week" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function vehicleOf(details: Record<string, unknown>): ClassifiedVehicle | null {
  const make = (details["vehicle_make"] as string | null) ?? null;
  const model = (details["vehicle_model"] as string | null) ?? null;
  const year = (details["vehicle_year"] as number | null) ?? null;
  if (!make && !model && year == null) return null;
  return {
    year,
    make,
    model,
    trim: (details["vehicle_trim"] as string | null) ?? null,
    mileage: (details["vehicle_mileage"] as number | null) ?? null,
    bodyStyle: (details["vehicle_body_style"] as string | null) ?? null,
    transmission: (details["vehicle_transmission"] as string | null) ?? null,
    drivetrain: (details["vehicle_drivetrain"] as string | null) ?? null,
    fuelType: (details["vehicle_fuel_type"] as string | null) ?? null,
    exteriorColor: (details["vehicle_exterior_color"] as string | null) ?? null,
    titleStatus: (details["vehicle_title_status"] as string | null) ?? null,
    vin: (details["vin"] as string | null) ?? null,
  };
}

/** The database compatibility function stores vehicle JSON with SQL-style keys. */
function vehicleForRpc(vehicle: ClassifiedListingInput["vehicle"] | undefined) {
  if (!vehicle) return {};
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    body_style: vehicle.bodyStyle,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    fuel_type: vehicle.fuelType,
    exterior_color: vehicle.exteriorColor,
    title_status: vehicle.titleStatus,
    vin: vehicle.vin,
  };
}

/** Home/job/service JSON keys are stored camelCase, matching the SQL extraction. */
function homeForRpc(home: ClassifiedListingInput["home"] | undefined) {
  return home ?? {};
}
function jobForRpc(job: ClassifiedListingInput["job"] | undefined) {
  return job ?? {};
}
function serviceForRpc(service: ClassifiedListingInput["service"] | undefined) {
  return service ?? {};
}

function petForRpc(pet: ClassifiedListingInput["pet"] | undefined) {
  return pet ?? {};
}

function homeOf(details: Record<string, unknown>): ClassifiedHomeDetails | null {
  const mode = (details["home_mode"] as string | null) ?? null;
  const propertyType = (details["home_property_type"] as string | null) ?? null;
  if (!mode || !propertyType) return null;
  const bedrooms = details["home_bedrooms"] as number | null;
  const bathrooms = details["home_bathrooms"] as number | null;
  return {
    mode: mode as ClassifiedHomeDetails["mode"],
    propertyType,
    bedrooms: bedrooms == null ? null : Number(bedrooms),
    bathrooms: bathrooms == null ? null : Number(bathrooms),
    squareFeet: (details["home_square_feet"] as number | null) ?? null,
    yearBuilt: (details["home_year_built"] as number | null) ?? null,
    acres: (details["home_acres"] as number | null) ?? null,
    acreage: (details["home_acreage"] as string | null) ?? null,
    heating: (details["home_heating"] as string | null) ?? null,
    cooling: (details["home_cooling"] as string | null) ?? null,
    garageParking: (details["home_garage_parking"] as string | null) ?? null,
    yard: (details["home_yard"] as string | null) ?? null,
    appliancesIncluded: (details["home_appliances_included"] as string | null) ?? null,
    floorCoverings: (details["home_floor_coverings"] as string | null) ?? null,
    basementType: (details["home_basement_type"] as string | null) ?? null,
    exteriorMaterial: (details["home_exterior_material"] as string | null) ?? null,
    specialFeatures: (details["home_special_features"] as string | null) ?? null,
    hoaFees: (details["home_hoa_fees"] as string | null) ?? null,
    schoolDistrict: (details["home_school_district"] as string | null) ?? null,
    leaseLength: (details["home_lease_length"] as string | null) ?? null,
    available: (details["home_available"] as string | null) ?? null,
    pets: (details["home_pets_policy"] as string | null) ?? null,
    smoking: (details["home_smoking_policy"] as string | null) ?? null,
    openHouse: (details["home_open_house"] as string | null) ?? null,
  };
}

function jobOf(details: Record<string, unknown>, description: string): ClassifiedJobDetails | null {
  const employerName = (details["job_employer_name"] as string | null) ?? null;
  const payType = (details["job_pay_type"] as string | null) ?? null;
  const employmentType = (details["job_employment_type"] as string | null) ?? null;
  if (!employerName || !payType || !employmentType) return null;
  const qualifications = details["job_qualifications"] as string[] | null;
  return {
    category: (details["job_category"] as string | null) ?? null,
    employerName,
    employerAddress: (details["job_employer_address"] as string | null) ?? null,
    payType: payType as ClassifiedJobDetails["payType"],
    payMin: Number(details["job_pay_min"] ?? 0),
    payMax: Number(details["job_pay_max"] ?? 0),
    employmentType: employmentType as ClassifiedJobDetails["employmentType"],
    experienceRequired: (details["job_experience_required"] as string | null) ?? null,
    educationLevel: (details["job_education_level"] as string | null) ?? null,
    jobSummary: description,
    responsibilities: (details["job_responsibilities"] as string[] | null) ?? [],
    ...(qualifications ? { qualifications } : {}),
  };
}

function serviceOf(
  details: Record<string, unknown>,
  description: string,
  priceCents: number,
): ClassifiedServiceDetails | null {
  const subcategory = (details["service_subcategory"] as string | null) ?? null;
  const serviceArea = (details["service_area"] as string | null) ?? null;
  if (!subcategory || !serviceArea) return null;
  return {
    subcategory,
    pricingType:
      (details["service_pricing_type"] as ClassifiedServiceDetails["pricingType"]) ??
      (priceCents > 0 ? "flat" : "quote"),
    priceMaxCents:
      details["service_price_max_cents"] == null
        ? null
        : Number(details["service_price_max_cents"]),
    pricing:
      details["service_pricing_type"] === "quote"
        ? "Call for quote"
        : details["service_price_max_cents"] != null &&
            Number(details["service_price_max_cents"]) > priceCents
          ? `From ${formatUsd(priceCents)} to ${formatUsd(Number(details["service_price_max_cents"]))}`
          : priceCents > 0
            ? formatUsd(priceCents)
            : "Call for quote",
    serviceArea,
    availability: (details["service_availability"] as string | null) ?? "",
    serviceSummary: description,
    offerings: (details["service_offerings"] as string[] | null) ?? [],
    businessAddress: (details["service_business_address"] as string | null) ?? null,
    licenseNumber: (details["service_license_number"] as string | null) ?? null,
    licenseLookupUrl: (details["service_license_lookup_url"] as string | null) ?? null,
  };
}

function petOf(details: Record<string, unknown>): ClassifiedPet | null {
  const subcategory = normalizePetSubcategory(details["pet_subcategory"] as string | null) ?? null;
  const species = normalizePetSpecies(details["pet_species"] as string | null) ?? null;
  const placementType = (details["pet_placement_type"] as string | null) ?? null;
  const offeredBy = (details["pet_offered_by"] as string | null) ?? null;
  if (!subcategory || !species || !placementType || !offeredBy) return null;
  return {
    subcategory,
    species,
    breed: (details["pet_breed"] as string | null) ?? null,
    name: (details["pet_name"] as string | null) ?? null,
    age: (details["pet_age"] as string | null) ?? null,
    sex: (details["pet_sex"] as string | null) ?? null,
    placementType,
    offeredBy,
    hypoallergenic: (details["pet_hypoallergenic"] as string | null) ?? null,
    vaccinated: (details["pet_vaccinated"] as string | null) ?? null,
    spayedNeutered: (details["pet_spayed_neutered"] as string | null) ?? null,
    microchipped: (details["pet_microchipped"] as string | null) ?? null,
    recordsAvailable: (details["pet_records_available"] as string | null) ?? null,
    goodWithKids: (details["pet_good_with_kids"] as string | null) ?? null,
    goodWithDogs: (details["pet_good_with_dogs"] as string | null) ?? null,
    goodWithCats: (details["pet_good_with_cats"] as string | null) ?? null,
    indoorOutdoor: (details["pet_indoor_outdoor"] as string | null) ?? null,
    specialNeeds: (details["pet_special_needs"] as string | null) ?? null,
    breedingTerms: (details["pet_breeding_terms"] as string | null) ?? null,
  };
}

function sortedMedia(row: Record<string, unknown>): string[] {
  const media = (row["listing_media"] as { storage_path: string; position: number }[] | null) ?? [];
  return [...media]
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((item) => item.storage_path);
}

// Signing requires the service-role client -- the anon/authenticated clients
// can't call storage's createSignedUrls even for objects their own RLS
// policies would let them read. Every caller has already scoped which rows
// (and therefore which paths) the viewer is allowed to see before this runs.
async function signListingMedia(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("listing-media")
      .createSignedUrls(unique, 60 * 60);
    if (error) {
      console.error("Could not sign classified listing media", error.message);
      return new Map();
    }
    return new Map(
      (data ?? [])
        .filter(
          (item) =>
            typeof item.path === "string" &&
            typeof item.signedUrl === "string" &&
            item.signedUrl.length > 0,
        )
        .map((item) => [item.path as string, item.signedUrl as string]),
    );
  } catch (error) {
    // A missing storage signing secret must degrade to image-less cards rather
    // than taking down public browse and homepage routes.
    console.error("Could not sign classified listing media", error);
    return new Map();
  }
}

async function signedAdminUrls(bucket: string, paths: string[] | null): Promise<string[]> {
  if (!paths?.length) return [];

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrls(paths, 60 * 60);
    if (error) return [];
    return (data ?? [])
      .map((item) => item.signedUrl)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
  } catch (error) {
    console.error("Could not sign classified media", error);
    return [];
  }
}

function toCard(row: Record<string, unknown>, urlByPath: Map<string, string>): ClassifiedCard {
  const product = row["products"] as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    categories: { slug: string; name: string } | null;
  };
  const details = row["classified_listing_details"] as Record<string, unknown>;
  const firstPath = sortedMedia(row)[0];
  const priceCents = row["price_cents"] as number;
  const description = product.description ?? "";
  return {
    id: row["id"] as string,
    title: product.name,
    productId: product.id,
    productSlug: product.slug,
    priceCents,
    currency: (row["currency"] as string) ?? "USD",
    city: details["city"] as string,
    state: ((details["state"] as string | null) ?? "ID").toUpperCase(),
    region: details["region"] as string,
    categorySlug: product.categories?.slug ?? null,
    categoryName: product.categories?.name ?? null,
    itemDetails: normalizeClassifiedItemDetails(
      product.categories?.slug ?? "general",
      (details["item_details"] as Record<string, unknown> | null) ?? {},
    ),
    condition: row["item_condition"] as string,
    fulfillmentMode: details["fulfillment_mode"] as string,
    createdAt: row["created_at"] as string,
    isFeatured:
      typeof row["featured_until"] === "string" &&
      new Date(row["featured_until"] as string).getTime() > Date.now(),
    imageUrl: (firstPath ? (urlByPath.get(firstPath) ?? null) : null) as string | null,
    vehicle: vehicleOf(details),
    pet: petOf(details),
    home: homeOf(details),
    job: jobOf(details, description),
    service: serviceOf(details, description, priceCents),
    dealer: row["dealer_profiles"]
      ? {
          displayName: (row["dealer_profiles"] as any).display_name,
          slug: (row["dealer_profiles"] as any).slug,
          logoUrl: (row["dealer_profiles"] as any).logo_url ?? null,
          city: (row["dealer_profiles"] as any).city ?? null,
          state: (row["dealer_profiles"] as any).state ?? null,
        }
      : null,
  };
}

function previewListingKey(listing: ClassifiedCard) {
  return [
    listing.title.trim().toLowerCase(),
    listing.categorySlug ?? "",
    listing.priceCents,
    listing.city.trim().toLowerCase(),
    listing.state.trim().toUpperCase(),
  ].join("|");
}

function mockCard(listing: (typeof mockClassifiedListings)[number]): ClassifiedCard {
  return {
    id: listing.id,
    title: listing.title,
    productId: listing.productId,
    productSlug: listing.productSlug,
    priceCents: listing.priceCents,
    currency: "USD",
    city: listing.city,
    state: listing.state,
    region: listing.region,
    categorySlug: listing.categorySlug,
    categoryName: listing.categoryName,
    condition: listing.condition,
    fulfillmentMode: listing.fulfillmentMode,
    createdAt: listing.createdAt,
    isFeatured: false,
    imageUrl: listing.images[0]?.url ?? null,
    vehicle: listing.vehicle
      ? {
          ...listing.vehicle,
        }
      : null,
    pet: listing.pet ?? null,
    home: listing.home ?? null,
    job: listing.job ?? null,
    service: listing.service ?? null,
    isMock: true,
    listingNumber: listing.listingNumber,
  };
}

function mockDetail(listing: (typeof mockClassifiedListings)[number]): ClassifiedDetail {
  const communitySlug = listing.home?.community?.slug;
  const communityListings = communitySlug
    ? mockClassifiedListings
        .filter((other) => other.id !== listing.id && other.home?.community?.slug === communitySlug)
        .map(mockCard)
    : undefined;
  const communityFloorplans = communitySlug
    ? homeCommunities[communitySlug]?.floorplans
    : undefined;
  const employerName = listing.job?.employerName;
  const employerListings = employerName
    ? mockClassifiedListings
        .filter((other) => other.id !== listing.id && other.job?.employerName === employerName)
        .map(mockCard)
    : undefined;
  return {
    ...mockCard(listing),
    description: listing.description,
    postalCode: listing.postalCode,
    expiresAt: listing.expiresAt,
    sellerNote: listing.sellerNote,
    variantId: `${listing.id}-variant`,
    seller: listing.seller,
    employerListings,
    images: listing.images,
    communityListings,
    communityFloorplans,
  };
}

function mockMatches(
  listing: (typeof mockClassifiedListings)[number],
  data: ClassifiedBrowseInput,
) {
  if (data.group === "motors" && !listing.vehicle) return false;
  if (data.group === "classifieds" && listing.vehicle) return false;
  if (data.category && data.category !== listing.categorySlug) return false;
  if (data.category === "other-real-estate" && data.homeTab && listing.home?.mode !== data.homeTab)
    return false;
  if (
    data.group === "classifieds" &&
    !classifiedCategories.some(
      (item) => item.slug === listing.categorySlug && item.group === "classifieds",
    )
  )
    return false;
  if (data.q) {
    const needle = data.q.toLowerCase();
    if (!`${listing.title} ${listing.description}`.toLowerCase().includes(needle)) return false;
  }
  if (data.state && data.state !== listing.state) return false;
  if (data.city && !listing.city.toLowerCase().includes(data.city.toLowerCase())) return false;
  if (data.sellerSlug && data.sellerSlug !== listing.seller.slug) return false;
  if (data.condition && !filterValues(data.condition).includes(listing.condition)) return false;
  if (
    data.fulfillment &&
    !filterValues(data.fulfillment).some(
      (value) => value === listing.fulfillmentMode || value === "both",
    )
  )
    return false;
  if (
    listing.categorySlug === "services" &&
    listing.priceCents <= 0 &&
    (data.priceMin != null || data.priceMax != null)
  )
    return false;
  if (data.priceMin != null && listing.priceCents < data.priceMin * 100) return false;
  if (data.priceMax != null && listing.priceCents > data.priceMax * 100) return false;
  if (
    data.itemDetailKey &&
    data.itemDetailValue &&
    !(listing as { itemDetails?: Record<string, string> }).itemDetails?.[data.itemDetailKey]
      ?.toLowerCase()
      .includes(data.itemDetailValue.toLowerCase())
  )
    return false;
  if (data.make && !filterValues(data.make).includes(listing.vehicle?.make ?? "")) return false;
  if (data.model && !filterValues(data.model).includes(listing.vehicle?.model ?? "")) return false;
  if (data.yearMin != null && (listing.vehicle?.year ?? -1) < data.yearMin) return false;
  if (data.yearMax != null && (listing.vehicle?.year ?? -1) > data.yearMax) return false;
  if (
    data.mileageMax != null &&
    (listing.vehicle?.mileage ?? Number.POSITIVE_INFINITY) > data.mileageMax
  )
    return false;
  if (data.bodyStyle && !filterValues(data.bodyStyle).includes(listing.vehicle?.bodyStyle ?? ""))
    return false;
  if (
    data.transmission &&
    !filterValues(data.transmission).includes(listing.vehicle?.transmission ?? "")
  )
    return false;
  if (data.drivetrain && !filterValues(data.drivetrain).includes(listing.vehicle?.drivetrain ?? ""))
    return false;
  if (data.fuelType && !filterValues(data.fuelType).includes(listing.vehicle?.fuelType ?? ""))
    return false;
  if (
    data.exteriorColor &&
    !filterValues(data.exteriorColor).includes(listing.vehicle?.exteriorColor ?? "")
  )
    return false;
  if (
    data.titleStatus &&
    !filterValues(data.titleStatus).includes(listing.vehicle?.titleStatus ?? "")
  )
    return false;
  if (
    data.homePropertyType &&
    !filterValues(data.homePropertyType).includes(listing.home?.propertyType ?? "")
  )
    return false;
  if (data.homeBedroomsMin != null && (listing.home?.bedrooms ?? -1) < data.homeBedroomsMin)
    return false;
  if (data.homeBathroomsMin != null && (listing.home?.bathrooms ?? -1) < data.homeBathroomsMin)
    return false;
  if (data.homeSquareFeetMin != null && (listing.home?.squareFeet ?? -1) < data.homeSquareFeetMin)
    return false;
  if (data.homeYearBuiltMin != null && (listing.home?.yearBuilt ?? -1) < data.homeYearBuiltMin)
    return false;
  const matchesAnyText = (actual: string | null | undefined, value: string | undefined) =>
    !value ||
    filterValues(value).some((item) => actual?.toLowerCase().includes(item.toLowerCase()));
  if (!matchesAnyText(listing.home?.heating, data.homeHeating)) return false;
  if (!matchesAnyText(listing.home?.cooling, data.homeCooling)) return false;
  if (!matchesAnyText(listing.home?.garageParking, data.homeGarageParking)) return false;
  if (!matchesAnyText(listing.home?.yard, data.homeYard)) return false;
  if (!matchesAnyText(listing.home?.schoolDistrict, data.homeSchoolDistrict)) return false;
  if (
    data.homeLeaseLength &&
    !filterValues(data.homeLeaseLength).some((item) =>
      matchesLeaseLength(listing.home?.leaseLength, item),
    )
  )
    return false;
  if (!matchesAnyText(listing.home?.available, data.homeAvailable)) return false;
  if (!matchesAnyText(listing.home?.pets, data.homePetsPolicy)) return false;
  if (!matchesAnyText(listing.home?.smoking, data.homeSmokingPolicy)) return false;
  if (data.homeAcresMin != null) {
    const acres = Number(listing.home?.acreage?.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] ?? NaN);
    if (!Number.isFinite(acres) || acres < data.homeAcresMin) return false;
  }
  if (data.jobCategory && !filterValues(data.jobCategory).includes(listing.job?.category ?? ""))
    return false;
  if (
    data.jobEmployer &&
    !listing.job?.employerName.toLowerCase().includes(data.jobEmployer.toLowerCase())
  )
    return false;
  if (data.jobPayType && !filterValues(data.jobPayType).includes(listing.job?.payType ?? ""))
    return false;
  if (
    data.jobEmploymentType &&
    !filterValues(data.jobEmploymentType).includes(listing.job?.employmentType ?? "")
  )
    return false;
  if (data.jobPayMin != null && (listing.job?.payMax ?? 0) < data.jobPayMin) return false;
  if (data.jobPayMax != null && (listing.job?.payMin ?? 0) > data.jobPayMax) return false;
  if (
    data.jobExperience &&
    !listing.job?.experienceRequired?.toLowerCase().includes(data.jobExperience.toLowerCase())
  )
    return false;
  if (
    data.jobEducation &&
    !listing.job?.educationLevel?.toLowerCase().includes(data.jobEducation.toLowerCase())
  )
    return false;
  if (
    data.serviceSubcategory &&
    !listing.service?.subcategory.toLowerCase().includes(data.serviceSubcategory.toLowerCase())
  )
    return false;
  if (!matchesAnyText(listing.service?.serviceArea, data.serviceArea)) return false;
  if (!matchesAnyText(listing.service?.availability, data.serviceAvailability)) return false;
  if (data.serviceLicenseRequired && !listing.service?.licenseNumber) return false;
  if (data.hasPhotos && listing.images.length === 0) return false;
  if (data.postedWithin) {
    const createdAfter = postedSince(data.postedWithin);
    if (createdAfter && listing.createdAt < createdAfter) return false;
  }
  if (
    data.petSubcategory &&
    normalizePetSubcategory(listing.pet?.subcategory) !==
      normalizePetSubcategory(data.petSubcategory)
  )
    return false;
  if (
    data.petSpecies &&
    normalizePetSpecies(listing.pet?.species) !== normalizePetSpecies(data.petSpecies)
  )
    return false;
  if (data.petBreed && listing.pet?.breed !== data.petBreed) return false;
  if (data.petPlacementType && listing.pet?.placementType !== data.petPlacementType) return false;
  if (data.petOfferedBy && listing.pet?.offeredBy !== data.petOfferedBy) return false;
  if (data.petSex && listing.pet?.sex !== data.petSex) return false;
  if (data.petAge && !listing.pet?.age?.toLowerCase().includes(data.petAge.toLowerCase()))
    return false;
  for (const [value, actual] of [
    [data.petHypoallergenic, listing.pet?.hypoallergenic],
    [data.petVaccinated, listing.pet?.vaccinated],
    [data.petSpayedNeutered, listing.pet?.spayedNeutered],
    [data.petMicrochipped, listing.pet?.microchipped],
    [data.petRecordsAvailable, listing.pet?.recordsAvailable],
    [data.petGoodWithKids, listing.pet?.goodWithKids],
    [data.petGoodWithDogs, listing.pet?.goodWithDogs],
    [data.petGoodWithCats, listing.pet?.goodWithCats],
    [data.petIndoorOutdoor, listing.pet?.indoorOutdoor],
  ] as const) {
    if (value && actual !== value) return false;
  }
  return true;
}

export type ClassifiedBrowseInput = {
  /** Internal homepage read: keep the full mock catalog available for curation. */
  includeAllMocks?: boolean | undefined;
  q?: string | undefined;
  category?: string | undefined;
  homeTab?: "buy" | "rent" | "build" | undefined;
  homePropertyType?: string | undefined;
  homeBedroomsMin?: number | undefined;
  homeBathroomsMin?: number | undefined;
  homeSquareFeetMin?: number | undefined;
  homeYearBuiltMin?: number | undefined;
  homeAcresMin?: number | undefined;
  homeHeating?: string | undefined;
  homeCooling?: string | undefined;
  homeGarageParking?: string | undefined;
  homeYard?: string | undefined;
  homeSchoolDistrict?: string | undefined;
  homeLeaseLength?: string | undefined;
  homeAvailable?: string | undefined;
  homePetsPolicy?: string | undefined;
  homeSmokingPolicy?: string | undefined;
  jobCategory?: string | undefined;
  jobEmployer?: string | undefined;
  jobPayType?: string | undefined;
  jobEmploymentType?: string | undefined;
  jobPayMin?: number | undefined;
  jobPayMax?: number | undefined;
  jobExperience?: string | undefined;
  jobEducation?: string | undefined;
  serviceSubcategory?: string | undefined;
  serviceArea?: string | undefined;
  serviceAvailability?: string | undefined;
  serviceLicenseRequired?: boolean | undefined;
  postedWithin?: "hour" | "day" | "week" | "month" | undefined;
  hasPhotos?: boolean | undefined;
  group?: string | undefined;
  region?: string | undefined;
  state?: string | undefined;
  city?: string | undefined;
  postalCode?: string | undefined;
  sellerSlug?: string | undefined;
  dealerSlug?: string | undefined;
  condition?: string | undefined;
  fulfillment?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  make?: string | undefined;
  model?: string | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
  mileageMax?: number | undefined;
  bodyStyle?: string | undefined;
  transmission?: string | undefined;
  drivetrain?: string | undefined;
  fuelType?: string | undefined;
  exteriorColor?: string | undefined;
  titleStatus?: string | undefined;
  petSubcategory?: string | undefined;
  petSpecies?: string | undefined;
  petBreed?: string | undefined;
  petPlacementType?: string | undefined;
  petOfferedBy?: string | undefined;
  petSex?: string | undefined;
  petAge?: string | undefined;
  petHypoallergenic?: string | undefined;
  petVaccinated?: string | undefined;
  petSpayedNeutered?: string | undefined;
  petMicrochipped?: string | undefined;
  petRecordsAvailable?: string | undefined;
  petGoodWithKids?: string | undefined;
  petGoodWithDogs?: string | undefined;
  petGoodWithCats?: string | undefined;
  petIndoorOutdoor?: string | undefined;
  itemDetailKey?: string | undefined;
  itemDetailValue?: string | undefined;
  sort?: "newest" | "price_low" | "price_high" | "mileage_low" | undefined;
  page?: number | undefined;
};

const text = (value: unknown, max = 80) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const escapeLikeValue = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const filterValues = (value: string | undefined) =>
  value
    ?.split(/\|{1,2}/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
const num = (value: unknown) => {
  return optionalNonNegativeNumber(value);
};
const integerNum = (value: unknown) => {
  return optionalNonNegativeInteger(value);
};

export const browseClassifieds = createServerFn({ method: "GET" })
  .validator((input: ClassifiedBrowseInput): ClassifiedBrowseInput => ({
    q: text(input?.q),
    category: text(input?.category, 60),
    homeTab:
      input?.homeTab === "buy" || input?.homeTab === "rent" || input?.homeTab === "build"
        ? input.homeTab
        : undefined,
    homePropertyType: text(input?.homePropertyType, 120),
    homeBedroomsMin: num(input?.homeBedroomsMin),
    homeBathroomsMin: num(input?.homeBathroomsMin),
    homeSquareFeetMin: num(input?.homeSquareFeetMin),
    homeYearBuiltMin: integerNum(input?.homeYearBuiltMin),
    homeAcresMin: num(input?.homeAcresMin),
    homeHeating: text(input?.homeHeating, 80),
    homeCooling: text(input?.homeCooling, 80),
    homeGarageParking: text(input?.homeGarageParking, 120),
    homeYard: text(input?.homeYard, 120),
    homeSchoolDistrict: text(input?.homeSchoolDistrict, 120),
    homeLeaseLength: text(input?.homeLeaseLength, 60),
    homeAvailable: text(input?.homeAvailable, 60),
    homePetsPolicy: text(input?.homePetsPolicy, 120),
    homeSmokingPolicy: text(input?.homeSmokingPolicy, 60),
    jobCategory: text(input?.jobCategory, 80),
    jobEmployer: text(input?.jobEmployer, 120),
    jobPayType: text(input?.jobPayType, 80),
    jobEmploymentType: text(input?.jobEmploymentType, 120),
    jobPayMin: num(input?.jobPayMin),
    jobPayMax: num(input?.jobPayMax),
    jobExperience: text(input?.jobExperience, 80),
    jobEducation: text(input?.jobEducation, 80),
    serviceSubcategory: text(input?.serviceSubcategory, 100),
    serviceArea: text(input?.serviceArea, 200),
    serviceAvailability: text(input?.serviceAvailability, 120),
    serviceLicenseRequired: input?.serviceLicenseRequired === true ? true : undefined,
    postedWithin: ["hour", "day", "week", "month"].includes(input?.postedWithin as never)
      ? input.postedWithin
      : undefined,
    hasPhotos: input?.hasPhotos === true ? true : undefined,
    group: text(input?.group, 20),
    region: text(input?.region),
    state: text(input?.state, 2)?.toUpperCase(),
    city: text(input?.city),
    postalCode: text(input?.postalCode, 12)?.replace(/[^0-9-]/g, ""),
    sellerSlug: text(input?.sellerSlug, 60),
    dealerSlug: text(input?.dealerSlug, 80),
    condition:
      filterValues(text(input?.condition, 120))
        .filter((value) => conditionValues.includes(value as never))
        .join("||") || undefined,
    fulfillment: text(input?.fulfillment, 20),
    priceMin: num(input?.priceMin),
    priceMax: num(input?.priceMax),
    make: text(input?.make),
    model: text(input?.model),
    yearMin: integerNum(input?.yearMin),
    yearMax: integerNum(input?.yearMax),
    mileageMax: integerNum(input?.mileageMax),
    bodyStyle: text(input?.bodyStyle, 30),
    transmission: text(input?.transmission, 30),
    drivetrain: text(input?.drivetrain, 20),
    fuelType: text(input?.fuelType, 30),
    exteriorColor: text(input?.exteriorColor, 30),
    titleStatus: text(input?.titleStatus, 30),
    petSubcategory: normalizePetSubcategory(text(input?.petSubcategory, 80)),
    petSpecies: normalizePetSpecies(text(input?.petSpecies, 40)),
    petBreed: text(input?.petBreed, 100),
    petPlacementType: text(input?.petPlacementType, 30),
    petOfferedBy: text(input?.petOfferedBy, 30),
    petSex: text(input?.petSex, 30),
    petAge: text(input?.petAge, 60),
    petHypoallergenic: text(input?.petHypoallergenic, 20),
    petVaccinated: text(input?.petVaccinated, 20),
    petSpayedNeutered: text(input?.petSpayedNeutered, 20),
    petMicrochipped: text(input?.petMicrochipped, 20),
    petRecordsAvailable: text(input?.petRecordsAvailable, 20),
    petGoodWithKids: text(input?.petGoodWithKids, 20),
    petGoodWithDogs: text(input?.petGoodWithDogs, 20),
    petGoodWithCats: text(input?.petGoodWithCats, 20),
    petIndoorOutdoor: text(input?.petIndoorOutdoor, 30),
    itemDetailKey: text(input?.itemDetailKey, 60),
    itemDetailValue: text(input?.itemDetailValue, 200),
    sort: (["newest", "price_low", "price_high", "mileage_low"] as const).includes(
      input?.sort as never,
    )
      ? input.sort
      : "newest",
    page: Math.max(1, Math.min(50, Number(input?.page ?? 1) || 1)),
  }))
  .handler(async ({ data }): Promise<ClassifiedBrowseResult> => runBrowseClassifieds(data));

async function runBrowseClassifieds(data: ClassifiedBrowseInput): Promise<ClassifiedBrowseResult> {
  {
    const client = publicServerClient();
    const page = data.page ?? 1;
    const empty = { listings: [], total: 0, page, pageSize: PAGE_SIZE };
    if (
      isInvertedRange(data.priceMin, data.priceMax) ||
      isInvertedRange(data.yearMin, data.yearMax) ||
      isInvertedRange(data.jobPayMin, data.jobPayMax)
    ) {
      return empty;
    }
    const nowIso = new Date().toISOString();

    // Expired placements are cleared before ranking so an old purchase can
    // never remain above ordinary results. This does not touch the immutable
    // purchase/receipt history shown in Seller Billing.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await (supabaseAdmin as any)
        .from("asks")
        .update({ featured_until: null })
        .not("featured_until", "is", null)
        .lte("featured_until", nowIso);
      if (error) console.error("Could not clear expired featured placements", error.message);
    } catch (error) {
      console.error("Could not clear expired featured placements", error);
    }

    let categoryIds: string[] | null = null;
    let mockOnlyCategory = false;
    if (data.category) {
      const { data: category } = await client
        .from("categories")
        .select("id")
        .eq("slug", data.category)
        .maybeSingle();
      if (!category) {
        mockOnlyCategory = [...mockClassifiedListings, ...mockVehicleListings].some(
          (listing) => listing.categorySlug === data.category,
        );
        if (!mockOnlyCategory) return empty;
      } else {
        categoryIds = [category.id];
      }
    } else if (data.group) {
      const slugs = classifiedCategories
        .filter((category) => category.group === data.group)
        .map((category) => category.slug);
      if (slugs.length === 0) return empty;
      const { data: rows } = await client.from("categories").select("id").in("slug", slugs);
      categoryIds = (rows ?? []).map((row) => row.id);
      if (categoryIds.length === 0) mockOnlyCategory = true;
    }

    let query = client
      .from("asks")
      .select(LISTING_SELECT, { count: "exact" })
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", nowIso)
      .eq("products.status", "published");

    if (categoryIds) query = query.in("products.category_id", categoryIds);
    if (data.q) {
      const q = escapeFilterValue(data.q);
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`, {
        referencedTable: "products",
      });
    }
    if (data.region) query = query.eq("classified_listing_details.region", data.region);
    if (data.state) query = query.eq("classified_listing_details.state", data.state);
    if (data.city)
      query = query.ilike("classified_listing_details.city", `%${escapeLikeValue(data.city)}%`);
    if (data.postalCode)
      query = query.ilike(
        "classified_listing_details.postal_code",
        `${escapeLikeValue(data.postalCode)}%`,
      );
    if (data.sellerSlug) {
      const { data: seller } = await client
        .from("seller_storefronts")
        .select("user_id")
        .eq("slug", data.sellerSlug)
        .maybeSingle();
      if (!seller?.user_id) return empty;
      query = query.eq("seller_id", seller.user_id);
    }
    if (data.dealerSlug) {
      const { data: dealer } = await client
        .from("dealer_profiles")
        .select("id")
        .eq("slug", data.dealerSlug)
        .eq("status", "ready")
        .not("agreements_accepted_at", "is", null)
        .maybeSingle();
      if (!dealer?.id) return empty;
      query = query.eq("dealer_id", dealer.id);
    }
    if (data.condition) {
      const conditions = filterValues(data.condition).filter((value) =>
        conditionValues.includes(value as never),
      );
      const expandedConditions = conditions.includes("new_with_tags")
        ? [...new Set([...conditions, "new_without_tags"])]
        : conditions;
      const [firstCondition, ...otherConditions] = expandedConditions;
      if (firstCondition && otherConditions.length === 0)
        query = query.eq("item_condition", firstCondition as never);
      if (firstCondition && otherConditions.length > 0)
        query = query.in("item_condition", [firstCondition, ...otherConditions] as never);
    }
    if (data.fulfillment) {
      const fulfillment = filterValues(data.fulfillment);
      const modes = fulfillment.includes("both")
        ? ["local_pickup", "shipping", "both"]
        : [...fulfillment, "both"];
      if (modes.length > 0) query = applyReferencedFilter(query, "fulfillment_mode", modes);
    }
    if (data.category === "services" && (data.priceMin != null || data.priceMax != null))
      query = query.gt("price_cents", 0);
    if (data.priceMin != null) query = query.gte("price_cents", Math.round(data.priceMin * 100));
    if (data.priceMax != null) query = query.lte("price_cents", Math.round(data.priceMax * 100));
    if (data.itemDetailKey && data.itemDetailValue) {
      const allowedKey = /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(data.itemDetailKey)
        ? data.itemDetailKey
        : null;
      if (allowedKey)
        query = query.ilike(
          `classified_listing_details.item_details->>${allowedKey}`,
          `%${escapeLikeValue(data.itemDetailValue)}%`,
        );
    }
    if (data.homeTab && data.category === "other-real-estate")
      query = applyReferencedFilter(query, "home_mode", [data.homeTab]);
    for (const [value, column] of [[data.homePropertyType, "home_property_type"]] as const) {
      const values = filterValues(value);
      if (values.length > 0) query = applyReferencedFilter(query, column, values);
    }
    if (data.homeBedroomsMin != null)
      query = query.gte("classified_listing_details.home_bedrooms", data.homeBedroomsMin);
    if (data.homeBathroomsMin != null)
      query = query.gte("classified_listing_details.home_bathrooms", data.homeBathroomsMin);
    if (data.homeSquareFeetMin != null)
      query = query.gte("classified_listing_details.home_square_feet", data.homeSquareFeetMin);
    if (data.homeYearBuiltMin != null)
      query = query.gte("classified_listing_details.home_year_built", data.homeYearBuiltMin);
    if (data.homeAcresMin != null)
      query = query.gte("classified_listing_details.home_acres", data.homeAcresMin);
    for (const [value, column] of [
      [data.homeHeating, "home_heating"],
      [data.homeCooling, "home_cooling"],
      [data.homeGarageParking, "home_garage_parking"],
      [data.homeYard, "home_yard"],
      [data.homeSchoolDistrict, "home_school_district"],
      [
        data.homeLeaseLength
          ?.split("||")
          .map((item) => item.match(/\d+/)?.[0] ?? item)
          .join("||"),
        "home_lease_length",
      ],
      [data.homeAvailable, "home_available"],
      [data.homePetsPolicy, "home_pets_policy"],
      [data.homeSmokingPolicy, "home_smoking_policy"],
    ] as const) {
      if (value) query = applyReferencedContainsAny(query, column, value);
    }
    for (const [value, column] of [
      [data.jobCategory, "job_category"],
      [data.jobPayType, "job_pay_type"],
      [data.jobEmploymentType, "job_employment_type"],
    ] as const) {
      const values = filterValues(value);
      if (values.length > 0) query = applyReferencedFilter(query, column, values);
    }
    if (data.jobEmployer)
      query = applyReferencedContains(query, "job_employer_name", data.jobEmployer);
    if (data.jobExperience)
      query = applyReferencedContains(query, "job_experience_required", data.jobExperience);
    if (data.jobEducation)
      query = applyReferencedContains(query, "job_education_level", data.jobEducation);
    if (data.jobPayMin != null)
      query = query.gte("classified_listing_details.job_pay_max", data.jobPayMin);
    if (data.jobPayMax != null)
      query = query.lte("classified_listing_details.job_pay_min", data.jobPayMax);
    if (data.serviceSubcategory)
      query = applyReferencedContains(query, "service_subcategory", data.serviceSubcategory);
    if (data.serviceArea) query = applyReferencedContains(query, "service_area", data.serviceArea);
    if (data.serviceAvailability)
      query = applyReferencedContains(query, "service_availability", data.serviceAvailability);
    if (data.serviceLicenseRequired)
      query = query.not("classified_listing_details.service_license_number", "is", null);
    if (data.hasPhotos) query = query.gt("public_media_count", 0);
    const createdAfter = postedSince(data.postedWithin);
    if (createdAfter) query = query.gte("created_at", createdAfter);
    if (data.make) {
      const makes = filterValues(data.make);
      if (makes.length > 0) query = applyReferencedFilter(query, "vehicle_make", makes);
    }
    if (data.model) {
      const models = filterValues(data.model);
      if (models.length > 0) query = applyReferencedFilter(query, "vehicle_model", models);
    }
    if (data.yearMin != null)
      query = query.gte("classified_listing_details.vehicle_year", data.yearMin);
    if (data.yearMax != null)
      query = query.lte("classified_listing_details.vehicle_year", data.yearMax);
    if (data.mileageMax != null)
      query = query.lte("classified_listing_details.vehicle_mileage", data.mileageMax);
    for (const [value, column] of [
      [data.bodyStyle, "classified_listing_details.vehicle_body_style"],
      [data.transmission, "classified_listing_details.vehicle_transmission"],
      [data.drivetrain, "classified_listing_details.vehicle_drivetrain"],
      [data.fuelType, "classified_listing_details.vehicle_fuel_type"],
      [data.exteriorColor, "classified_listing_details.vehicle_exterior_color"],
      [data.titleStatus, "classified_listing_details.vehicle_title_status"],
    ] as const) {
      const values = filterValues(value);
      if (values.length > 0)
        query = applyReferencedFilter(
          query,
          column.replace("classified_listing_details.", ""),
          values,
        );
    }
    for (const [value, column] of [
      [data.petSubcategory, "pet_subcategory"],
      [data.petSpecies, "pet_species"],
      [data.petBreed, "pet_breed"],
      [data.petPlacementType, "pet_placement_type"],
      [data.petOfferedBy, "pet_offered_by"],
      [data.petSex, "pet_sex"],
      [data.petHypoallergenic, "pet_hypoallergenic"],
      [data.petVaccinated, "pet_vaccinated"],
      [data.petSpayedNeutered, "pet_spayed_neutered"],
      [data.petMicrochipped, "pet_microchipped"],
      [data.petRecordsAvailable, "pet_records_available"],
      [data.petGoodWithKids, "pet_good_with_kids"],
      [data.petGoodWithDogs, "pet_good_with_dogs"],
      [data.petGoodWithCats, "pet_good_with_cats"],
      [data.petIndoorOutdoor, "pet_indoor_outdoor"],
    ] as const) {
      const values = filterValues(value);
      if (values.length > 0) query = applyReferencedFilter(query, column, values);
    }
    if (data.petAge) query = applyReferencedContains(query, "pet_age", data.petAge);

    // Featured listings always appear before standard results. Within each
    // group, the selected browse sort still applies.
    query = query.order("featured_until", { ascending: false, nullsFirst: false });
    switch (data.sort) {
      case "price_low":
        query =
          data.category === "jobs"
            ? query.order("job_pay_min", {
                ascending: true,
                nullsFirst: false,
                referencedTable: "classified_listing_details",
              })
            : query.order("price_cents", { ascending: true });
        break;
      case "price_high":
        query =
          data.category === "jobs"
            ? query.order("job_pay_min", {
                ascending: false,
                nullsFirst: false,
                referencedTable: "classified_listing_details",
              })
            : query.order("price_cents", { ascending: false });
        break;
      case "mileage_low":
        query = query.order("vehicle_mileage", {
          ascending: true,
          nullsFirst: false,
          referencedTable: "classified_listing_details",
        });
        query = query.order("created_at", { ascending: false });
        break;
      default:
        query = query.order("ranking_at", { ascending: false });
    }
    // Deterministic tiebreaker so paging never repeats or skips a listing.
    query = query.order("id", { ascending: true });

    const from = (page - 1) * PAGE_SIZE;
    // Pay units are deliberately normalized in `comparableJobPay` (hourly
    // annualized, salary/commission/contract kept in their stated units).
    // A raw SQL order on job_pay_min would put $16/hour beside $16/year and
    // would make page boundaries disagree with the visible sort. Fetch the
    // bounded job result set before applying the same comparator used for
    // preview records so the selected sort is truthful for real listings too.
    const unitAwareJobSort =
      data.category === "jobs" && (data.sort === "price_low" || data.sort === "price_high");
    const resultRange = unitAwareJobSort
      ? { from: 0, to: Math.max(4_999, from + PAGE_SIZE - 1) }
      : { from, to: from + PAGE_SIZE - 1 };
    const {
      data: rows,
      count,
      error,
    } = mockOnlyCategory
      ? { data: [], count: 0, error: null }
      : await query.range(resultRange.from, resultRange.to);
    if (error) console.error("browseClassifieds failed; showing preview fixtures", error.message);

    const visibleRows = (rows ?? []).filter(
      (row) => !isReleaseQaListing(row as unknown as Record<string, unknown>),
    );
    const urlByPath = await signListingMedia(
      visibleRows.flatMap((row) =>
        sortedMedia(row as unknown as Record<string, unknown>).slice(0, 1),
      ),
    );
    const listings = visibleRows.map((row) =>
      toCard(row as unknown as Record<string, unknown>, urlByPath),
    );
    const motorCategory = data.category
      ? classifiedCategories.find((category) => category.slug === data.category)?.group === "motors"
      : false;
    const mockSource =
      data.group === "motors" || motorCategory ? mockVehicleListings : mockClassifiedListings;
    // Preview fixtures are useful on public browse/homepage routes, but they
    // must never appear in scoped seller or dealership inventory. A storefront
    // represents one persisted owner/source and showing unrelated fixtures
    // makes a newly created dealership look like it owns the marketplace.
    const scopedToOwner = Boolean(data.dealerSlug || data.sellerSlug);
    const mockListings =
      page === 1 && !scopedToOwner
        ? mockSource
            .filter((listing) => mockMatches(listing, data))
            .filter((listing) => {
              // Seeded production rows and preview fixtures can describe the
              // same item. Keep the persisted record as the source of truth so
              // buyers do not see duplicate cards or inflated counts.
              const key = previewListingKey(mockCard(listing));
              return !listings.some((persisted) => previewListingKey(persisted) === key);
            })
            .map(mockCard)
        : [];
    const compareListings = (a: ClassifiedCard, b: ClassifiedCard) => {
      if (data.sort === "price_low" || data.sort === "price_high") {
        const aValue = a.job ? comparableJobPay(a.job.payType, a.job.payMin) : a.priceCents;
        const bValue = b.job ? comparableJobPay(b.job.payType, b.job.payMin) : b.priceCents;
        const difference = data.sort === "price_low" ? aValue - bValue : bValue - aValue;
        return difference || a.id.localeCompare(b.id);
      }
      if (data.sort === "mileage_low") {
        const aMileage = a.vehicle?.mileage ?? Number.POSITIVE_INFINITY;
        const bMileage = b.vehicle?.mileage ?? Number.POSITIVE_INFINITY;
        return aMileage - bMileage || a.id.localeCompare(b.id);
      }
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        a.id.localeCompare(b.id)
      );
    };
    const featuredListings = listings.filter((listing) => listing.isFeatured).sort(compareListings);
    const standardListings = [
      ...listings.filter((listing) => !listing.isFeatured),
      ...mockListings,
    ].sort(compareListings);
    const resultLimit = data.includeAllMocks ? Math.max(PAGE_SIZE, mockSource.length) : PAGE_SIZE;
    const orderedListings = [...featuredListings, ...standardListings];
    const combinedListings = unitAwareJobSort
      ? orderedListings.slice(from, from + resultLimit)
      : orderedListings.slice(0, resultLimit);
    if (listings.length > 0) {
      void import("@/integrations/supabase/client.server")
        .then(({ supabaseAdmin }) =>
          (supabaseAdmin as any).rpc("record_classified_listing_impressions", {
            _listing_ids: listings.map((listing) => listing.id),
          }),
        )
        .catch(() => undefined);
    }
    return {
      listings: combinedListings,
      total: (count ?? listings.length) + mockListings.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }
}

export const getClassifiedListing = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => ({ id: String(input.id).slice(0, 64) }))
  .handler(async ({ data }): Promise<ClassifiedDetail | null> => {
    const mockListing = [...mockClassifiedListings, ...mockVehicleListings].find(
      (listing) => listing.id === data.id,
    );
    if (mockListing) return mockDetail(mockListing);

    const client = publicServerClient();
    const { data: row, error } = await client
      .from("asks")
      .select(LISTING_SELECT)
      .eq("id", data.id)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published")
      .maybeSingle();

    if (error) console.error("getClassifiedListing failed", error.message);
    if (!row || isReleaseQaListing(row as unknown as Record<string, unknown>)) return null;

    const record = row as unknown as Record<string, unknown>;
    void import("@/integrations/supabase/client.server")
      .then(({ supabaseAdmin }) =>
        (supabaseAdmin as any).rpc("record_classified_listing_view", { _listing_id: data.id }),
      )
      .catch(() => undefined);
    const paths = sortedMedia(record);
    const urlByPath = await signListingMedia(paths);
    const product = record["products"] as { id: string; slug: string; description: string | null };
    const details = record["classified_listing_details"] as Record<string, unknown>;
    const card = toCard(record, urlByPath);
    const sellerId = record["seller_id"] as string | null;
    const [{ data: sellerRow }, sellerContact] = sellerId
      ? await Promise.all([
          client
            .from("seller_storefronts")
            .select("slug,display_name,bio,avatar_url,payout_verified,rating_average,review_count")
            .eq("user_id", sellerId)
            .maybeSingle(),
          (async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const [{ data: sellerProfile }, { data: sellerAuth }, { data: contactPreferences }] =
              await Promise.all([
                supabaseAdmin
                  .from("seller_profiles")
                  .select("ship_from_phone")
                  .eq("user_id", sellerId)
                  .maybeSingle(),
                supabaseAdmin.auth.admin.getUserById(sellerId),
                supabaseAdmin
                  .from("account_contact_preferences")
                  .select(
                    "allow_email,allow_phone,allow_text,show_contact_buttons,allow_internal_messages",
                  )
                  .eq("user_id", sellerId)
                  .maybeSingle(),
              ]);
            const showButtons = contactPreferences?.show_contact_buttons !== false;
            const phone = sellerProfile?.ship_from_phone ?? null;
            return {
              phone: showButtons && contactPreferences?.allow_phone === true ? phone : null,
              textPhone: showButtons && contactPreferences?.allow_text === true ? phone : null,
              email:
                showButtons && contactPreferences?.allow_email !== false
                  ? (sellerAuth?.user?.email ?? null)
                  : null,
              allowInternalMessages: contactPreferences?.allow_internal_messages !== false,
            };
          })(),
        ])
      : [
          { data: null },
          { phone: null, textPhone: null, email: null, allowInternalMessages: true },
        ];

    return {
      ...card,
      description: product.description,
      postalCode: (details["postal_code"] as string | null) ?? null,
      expiresAt: (record["expires_at"] as string | null) ?? null,
      sellerNote: (record["seller_note"] as string | null) ?? null,
      variantId: record["variant_id"] as string,
      seller: sellerRow
        ? {
            userId: sellerId ?? undefined,
            slug: sellerRow.slug ?? "",
            displayName: sellerRow.display_name ?? "Seller",
            bio: sellerRow.bio ?? null,
            avatarUrl: sellerRow.avatar_url ?? null,
            payoutVerified: sellerRow.payout_verified === true,
            ratingAverage:
              sellerRow.rating_average == null ? null : Number(sellerRow.rating_average),
            reviewCount: Number(sellerRow.review_count ?? 0),
            contactPhone: sellerContact.phone,
            contactTextPhone: sellerContact.textPhone,
            contactEmail: sellerContact.email,
            allowInternalMessages: sellerContact.allowInternalMessages,
          }
        : null,
      images: paths
        .map((path) => urlByPath.get(path))
        .filter((url): url is string => Boolean(url))
        .map((url) => ({ url, alt: card.title })),
    };
  });

export type ClassifiedRelated = { listings: ClassifiedCard[] };

export const getRelatedClassifieds = createServerFn({ method: "GET" })
  .validator(
    (input: { category?: string; region?: string; sellerSlug?: string; excludeId: string }) => ({
      category: text(input?.category, 60),
      region: text(input?.region),
      sellerSlug: text(input?.sellerSlug, 60),
      excludeId: String(input?.excludeId ?? "").slice(0, 64),
    }),
  )
  .handler(async ({ data }): Promise<ClassifiedRelated> => {
    if (!data.category && !data.sellerSlug) return { listings: [] };
    const result = await browseClassifieds({
      data: {
        ...(data.category ? { category: data.category } : {}),
        ...(data.region ? { region: data.region } : {}),
        ...(data.sellerSlug ? { sellerSlug: data.sellerSlug } : {}),
        sort: "newest",
        page: 1,
      },
    });
    return { listings: result.listings.filter((row) => row.id !== data.excludeId).slice(0, 8) };
  });

export type ClassifiedsHome = {
  totalActive: number;
  categoryCounts: Record<string, number>;
  motors: ClassifiedCard[];
  recent: ClassifiedCard[];
};

export const getClassifiedsHome = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClassifiedsHome> => {
    const client = publicServerClient();
    const nowIso = new Date().toISOString();

    const [{ data: categoryRows }, motors, recent] = await Promise.all([
      client
        .from("asks")
        .select(
          "id, products!inner(status, categories!inner(slug)), classified_listing_details!inner(listing_id)",
        )
        .eq("status", "active")
        .eq("is_demo", false)
        .not("approved_at", "is", null)
        .gt("expires_at", nowIso)
        .eq("products.status", "published")
        .limit(1000),
      runBrowseClassifieds({ group: "motors", sort: "newest", page: 1 }),
      runBrowseClassifieds({ sort: "newest", page: 1, includeAllMocks: true }),
    ]);

    const categoryCounts: Record<string, number> = {};
    for (const row of (categoryRows ?? []) as Record<string, unknown>[]) {
      const slug = (row["products"] as { categories: { slug: string } | null })?.categories?.slug;
      if (!slug) continue;
      categoryCounts[slug] = (categoryCounts[slug] ?? 0) + 1;
    }

    return {
      totalActive: (categoryRows ?? []).length,
      categoryCounts,
      motors: motors.listings.slice(0, 8),
      // Keep enough of the first page available for the homepage to build
      // several useful, non-identical curated rows without another round trip.
      recent: recent.listings.slice(0, Math.max(24, mockClassifiedListings.length)),
    };
  },
);

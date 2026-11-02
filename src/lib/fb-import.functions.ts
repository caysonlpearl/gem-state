import { getPhotoStorageModule } from "./photo-storage-access";
import { classifiedCategories } from "@/config/classifieds";
/* eslint-disable @typescript-eslint/no-explicit-any -- generated Supabase types lag newly applied tables until the next type generation */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  inferFacebookCategorySlug,
  normalizeFacebookCondition,
} from "@/lib/fb-import-normalization";

import { canonicalSellerSourceProfile, dieselDepotListingId } from "./seller-claims";
import { inferImportItemDetails } from "./import-subcategories";
import { findIdahoPlace } from "@/config/idaho-places";

/**
 * Only Facebook descriptions are a reliable category hint. On KSL, Vinted
 * and Whatnot the readers already pick a category, and descriptions there
 * are often blurbs (a novel's back cover mentions cars and babies), which
 * sent books to Cars & Trucks when guessed from.
 */
function categoryHintFrom(sourceProfileUrl: string | null | undefined, description: unknown) {
  return /facebook\.com/.test(String(sourceProfileUrl ?? ""))
    ? (description as string | null)
    : null;
}

import {
  canonicalImportSource,
  countImportedSellerListings,
  isSettledImportRemoval,
  type ScanEvidence,
  stagingFailureCode,
  type StagingFailure,
} from "./import-refresh";
import { z } from "zod";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Administrator access required.");
}

export type FbImportItemInput = {
  sourceUrl: string;
  title: string;
  description?: string | null;
  priceCents: number;
  condition?: string | null;
  categorySlug?: string;
  subcategory?: string;
  itemDetails?: Record<string, string>;
  city?: string | null;
  state?: string | null;
  photoUrls: string[];
  unavailable?: boolean | undefined;
  /** Facebook shows the Sold badge (implies unavailable). */
  sold?: boolean | undefined;
};

export type FbImportItem = {
  id: string;
  batchId: string;
  sourceProfileUrl: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  priceCents: number;
  condition: string | null;
  categorySlug: string;
  itemDetails: Record<string, string>;
  city: string;
  state: string;
  region: string;
  publicPaths: string[];
  photoUrls: string[];
  status: "draft" | "needs_update" | "possibly_removed" | "published" | "discarded";
  syncConflict?: string | null;
  previousPriceCents: number | null;
  previousDescription: string | null;
  listingId: string | null;
  createdAt: string;
};

// Staged photos live in a private bucket -- only the service-role client can
// sign them, the same pattern used to show listing media everywhere else
// (see signListingMedia in classifieds.functions.ts).
async function signStagedPhotos(admin: any, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const signed = new Map<string, string>();
  // Storage signs at most 1000 paths per request; a big batch (176 Vinted
  // items x 8 photos) failed whole and showed every item as "No photo".
  for (let start = 0; start < unique.length; start += 500) {
    const chunk = unique.slice(start, start + 500);
    const { currentPhotoMode, signPrivatePhotoUrls } = await getPhotoStorageModule();
    if (currentPhotoMode() === "r2") {
      for (const [path, url] of await signPrivatePhotoUrls("listing-media", chunk))
        signed.set(path, url);
    } else {
      const { data, error } = await admin.storage
        .from("listing-media")
        .createSignedUrls(chunk, 3600);
      if (error) {
        console.warn("Could not sign staged photos", error.message);
        continue;
      }
      for (const item of data ?? [])
        if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
  }
  return signed;
}

/**
 * Downloads a photo into a seller-agnostic staging path. The seller account
 * doesn't exist yet at stage time (Facebook never exposes an email to
 * resolve one from), but create_classified_listing checks that every photo
 * path's first segment is the caller's own uid -- so these get copied to a
 * real `${sellerId}/...` path at publish time, once a seller is known.
 */
async function downloadPhoto(admin: any, batchId: string, url: string): Promise<string> {
  const parsed = new URL(url);
  const permitted = ["fbcdn.net", "ksldigital.com", "vinted.net", "whatnot.com", "sandhills.com"];
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !permitted.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
  )
    throw new Error("Unsupported source photo host.");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Could not download photo (${response.status})`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("URL did not return an image.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new Error("Photo is larger than 12 MB.");
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `_staging/${batchId}/${crypto.randomUUID()}.${ext}`;
  const { currentPhotoUploadMode, getPhotoStorage } = await getPhotoStorageModule();
  if (currentPhotoUploadMode() !== "supabase") {
    await (await getPhotoStorage()).upload(path, buffer, contentType);
    return path;
  }
  const evidence = await admin.storage.from("ask-evidence").upload(path, buffer, { contentType });
  if (evidence.error) throw new Error(`Evidence upload failed: ${evidence.error.message}`);
  const publicUpload = await admin.storage
    .from("listing-media")
    .upload(path, buffer, { contentType });
  if (publicUpload.error) throw new Error(`Public upload failed: ${publicUpload.error.message}`);
  return path;
}

/** Copies a batch of staged photos into the resolved seller's own path
 * prefix in both buckets, returning the new paths in the same order. */
async function claimPhotosForSeller(
  admin: any,
  sellerId: string,
  stagingPaths: string[],
): Promise<string[]> {
  const { prepareImportPhotos } = await import("./fb-import-photos.server");
  const { currentPhotoUploadMode, getPhotoStorage } = await getPhotoStorageModule();
  return prepareImportPhotos(
    admin,
    sellerId,
    stagingPaths,
    currentPhotoUploadMode() === "supabase" ? undefined : await getPhotoStorage(),
  );
}

/** Rows per staging request; the admin page chunks scan results to this size. */
const STAGE_CHUNK_SIZE = 50;

export const stageFacebookImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      sourceProfileUrl: string;
      sellerName?: string | undefined;
      mode?: "refresh" | undefined;
      authorized?: boolean;
      items: FbImportItemInput[];
      scan?: ScanEvidence;
      seenUrls?: string[];
      finalizeScan?: boolean;
      removalSourceUrl?: string;
      batchId?: string;
    }) => {
      const sourceProfileUrl = canonicalSellerSourceProfile(String(input.sourceProfileUrl ?? ""));
      if (input.mode === "refresh" && input.authorized !== true)
        throw new Error("Confirm seller scan authorization.");
      if (!sourceProfileUrl) throw new Error("Enter the Facebook Marketplace profile URL.");
      const sellerName =
        String(input.sellerName ?? "")
          .trim()
          .slice(0, 120) || null;
      const scan = input.scan
        ? z
            .object({
              complete: z.boolean(),
              termination: z.enum(["count", "end", "incomplete"]),
              challenged: z.boolean(),
              unreadable: z.number().int().nonnegative(),
            })
            .parse(input.scan)
        : undefined;
      if (!Array.isArray(input.items) || input.items.length > STAGE_CHUNK_SIZE)
        throw new Error(`Stage at most ${STAGE_CHUNK_SIZE} rows per request.`);
      // Rows are validated one by one so a single malformed row is reported
      // as a retryable failure instead of rejecting the whole chunk.
      const invalidUrls: string[] = [];
      const invalidFailures: StagingFailure[] = [];
      const rowIndexes: number[] = [];
      const parsedItems = (input.items ?? []).map((raw, rowIndex) => {
        const result = z
          .object({
            sourceUrl: z.string().url().max(2048),
            title: z.string().max(1000),
            description: z.string().max(10000).nullish(),
            priceCents: z.number().int().min(0).max(1000000000),
            // Existing listings are deliberately read without downloading photos.
            photoUrls: z.array(z.string().url().max(4096)).max(8).default([]),
            unavailable: z.boolean().optional(),
            sold: z.boolean().optional(),
          })
          .passthrough()
          .safeParse(
            input.mode === "refresh" && raw && raw.unavailable === true
              ? {
                  sourceUrl: raw.sourceUrl,
                  unavailable: true,
                  sold: raw.sold === true,
                  title: "Unavailable listing",
                  priceCents: 0,
                  photoUrls: [],
                }
              : raw,
          );
        if (!result.success || !String(result.data.title ?? "").trim()) {
          invalidFailures.push({ rowIndex, reason: "invalid_row" });
          invalidUrls.push(
            String((raw as { sourceUrl?: unknown })?.sourceUrl ?? "").slice(0, 2048),
          );
          return null;
        }
        let canonicalUrl: string;
        try {
          canonicalUrl = canonicalImportSource(sourceProfileUrl, result.data.sourceUrl);
        } catch {
          invalidUrls.push(result.data.sourceUrl);
          invalidFailures.push({ rowIndex, reason: "unsupported_source" });
          return null;
        }
        rowIndexes.push(rowIndex);
        const item = result.data as FbImportItemInput;
        const categorySlug = inferFacebookCategorySlug(
          item.categorySlug,
          item.title,
          categoryHintFrom(sourceProfileUrl, item.description),
        );
        const state = item.state ? String(item.state).trim().slice(0, 80) : "";
        const city = item.city ? String(item.city).trim().slice(0, 80) : "";
        // Idaho cities use the listed spelling, and that city's region.
        const place = /^(id|idaho)$/i.test(state) ? findIdahoPlace(city) : undefined;
        return {
          sourceUrl: canonicalUrl,
          title: String(item.title ?? "")
            .trim()
            .slice(0, 120),
          description: item.description ? String(item.description).trim().slice(0, 5000) : null,
          priceCents: Math.max(0, Math.round(Number(item.priceCents) || 0)),
          // Animals have no item condition.
          condition:
            categorySlug === "pets" ? "not_applicable" : normalizeFacebookCondition(item.condition),
          categorySlug,
          subcategory:
            typeof item.subcategory === "string" ? item.subcategory.trim().slice(0, 200) : "",
          itemDetails: inferImportItemDetails(
            categorySlug,
            item.subcategory,
            item.itemDetails,
            item.title,
          ),
          city: place ? place[0] : city,
          state: place ? "ID" : state,
          region: place ? place[1] : "",
          photoUrls: (item.photoUrls ?? []).filter(Boolean).slice(0, 8),
          unavailable: item.unavailable === true,
          sold: item.sold === true,
        };
      });
      const items = parsedItems.filter(
        (item): item is NonNullable<(typeof parsedItems)[number]> => item !== null,
      );
      if (!items.length && !invalidUrls.length && !input.finalizeScan)
        throw new Error("No listings were provided.");
      return {
        sourceProfileUrl,
        sellerName,
        mode: input.mode,
        items,
        scan,
        finalizeScan: input.finalizeScan === true,
        removalSourceUrl: input.removalSourceUrl
          ? canonicalImportSource(sourceProfileUrl, input.removalSourceUrl)
          : undefined,
        seenUrls: (input.seenUrls ?? []).map((url) => canonicalImportSource(sourceProfileUrl, url)),
        invalidUrls,
        invalidFailures,
        rowIndexes,
        batchId:
          typeof input.batchId === "string" && /^[0-9a-z-]{1,64}$/i.test(input.batchId)
            ? input.batchId
            : undefined,
      };
    },
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      batchId: string;
      staged: number;
      updated: number;
      failed: number;
      failedUrls: string[];
      failures: StagingFailure[];
      flaggedRemoved: number;
      preservedActive: number;
      recaptured: number;
    }> => {
      await requireAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const { data: managed, error: managedError } = await admin
        .from("managed_import_sellers")
        .select("sync_enabled,owner_user_id")
        .eq("source_profile_url", data.sourceProfileUrl)
        .maybeSingle();
      if (managedError) throw new Error(managedError.message);
      if (managed?.sync_enabled === false) throw new Error("This seller paused Facebook sync.");

      // One batch per seller refresh: later chunks and the finalize call
      // reuse it (scoped to this admin and profile) instead of creating
      // hundreds of single-row batches.
      let batch: { id: string } | null = null;
      if (data.batchId) {
        const { data: existing, error } = await admin
          .from("fb_marketplace_import_batches")
          .select("id")
          .eq("id", data.batchId)
          .eq("source_profile_url", data.sourceProfileUrl)
          .eq("imported_by", context.userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        batch = existing ?? null;
      }
      if (!batch) {
        const { data: created, error: batchError } = await admin
          .from("fb_marketplace_import_batches")
          .insert({
            imported_by: context.userId,
            source_profile_url: data.sourceProfileUrl,
            seller_name: data.sellerName,
          })
          .select("id")
          .single();
        if (batchError) throw new Error(batchError.message);
        batch = created as { id: string };
      }

      // One prior-row lookup per request (a chunk of up to STAGE_CHUNK_SIZE
      // rows, or the single per-profile finalize), never one per listing.
      const { allImportRows } = await import("./import-pagination.server");
      const priorItems = await allImportRows(() =>
        admin
          .from("fb_marketplace_import_items")
          .select(
            "id,source_url,status,price_cents,title,description,listing_id,seller_id,category_slug,item_details,city,state,region,listing:asks!listing_id(status)",
            { count: "exact" },
          )
          .eq("source_profile_url", data.sourceProfileUrl)
          .order("id"),
      );
      const priorByUrl = new Map<string, any>(
        priorItems.map((row: any) => [
          canonicalImportSource(data.sourceProfileUrl, row.source_url),
          row,
        ]),
      );
      const dealerPrior = new Map<string, any>();
      if (data.sourceProfileUrl === "https://www.diesel-depot.com/inventory/") {
        for (const row of priorItems ?? []) {
          const id = dieselDepotListingId(row.source_url);
          if (id) dealerPrior.set(id, row);
        }
      }

      let staged = 0;
      let updated = 0;
      let failed = data.invalidUrls.length;
      const failedUrls: string[] = [...data.invalidUrls];
      const failures: StagingFailure[] = [...data.invalidFailures];
      const flaggedRemoved = 0;
      let preservedActive = 0;
      let recaptured = 0;
      const isRefresh = data.mode === "refresh";

      for (const [index, item] of data.items.entries()) {
        const rowIndex = data.rowIndexes[index] ?? index;
        let phase: "photo" | "write" = "write";
        // Per-row failures are isolated and reported by source URL so the
        // chunk stays retryable; every write below is idempotent.
        try {
          const priorDealer = dealerPrior.get(dieselDepotListingId(item.sourceUrl) ?? "");
          if (priorDealer) item.sourceUrl = priorDealer.source_url;
          const key = canonicalImportSource(data.sourceProfileUrl, item.sourceUrl);
          const prior = priorByUrl.get(key);
          if (prior) item.sourceUrl = prior.source_url;
          // Clearing an unpublished review row is not a permanent source exclusion.
          // Only fresh available data may recapture it; published/offline records,
          // pending edits and paused/archived sellers retain their separate guards.
          const recapture = prior?.status === "discarded" && !prior.listing_id;
          const clearedActive =
            isRefresh &&
            prior?.status === "discarded" &&
            !!prior.listing_id &&
            prior.listing?.status === "active";
          if (prior && prior.status !== "published" && !recapture && !clearedActive) continue;
          // A completed removal still has an import row for deduplication.
          // Never requeue or refresh an offline listing, or reactivate it.
          if (prior?.listing_id && prior.listing?.status !== "active") continue;
          if (isRefresh && prior && !recapture)
            item.itemDetails = inferImportItemDetails(
              prior.category_slug,
              item.subcategory,
              prior.item_details,
              item.title,
            );
          if (prior && !recapture && item.description === null && !item.unavailable)
            item.description = prior.description;
          // Source failures/status hints never change marketplace visibility.
          // This server-side rule also protects older extension clients.
          if (item.unavailable) {
            if (isRefresh && prior?.listing?.status === "active") preservedActive++;
            continue;
          }
          const classificationChanged =
            JSON.stringify(prior?.item_details ?? {}) !== JSON.stringify(item.itemDetails);

          // A refresh only re-checks listings that are already published, and
          // only touches what Facebook can actually have changed. Category,
          // condition and location are left exactly as the admin set them.
          if (isRefresh && prior && !recapture) {
            const changed =
              prior.price_cents !== item.priceCents ||
              (prior.description ?? "") !== (item.description ?? "") ||
              classificationChanged;
            if (!changed) continue;
            const { error } = await admin
              .from("fb_marketplace_import_items")
              .update({
                batch_id: batch.id,
                title: item.title,
                description: item.description,
                price_cents: item.priceCents,
                item_details: item.itemDetails,
                status: "needs_update",
                previous_price_cents: prior.price_cents,
                previous_description: prior.description,
              })
              .eq("source_profile_url", data.sourceProfileUrl)
              .eq("source_url", item.sourceUrl)
              .eq("status", prior.status);
            if (error) throw error;
            updated += 1;
            continue;
          }

          if (prior && prior.status === "published") {
            const changed =
              prior.price_cents !== item.priceCents ||
              (prior.description ?? "") !== (item.description ?? "") ||
              classificationChanged;
            if (!changed) continue;
            const { error } = await admin
              .from("fb_marketplace_import_items")
              .update({
                batch_id: batch.id,
                title: item.title,
                description: item.description,
                price_cents: item.priceCents,
                condition: item.condition,
                category_slug: item.categorySlug,
                item_details: item.itemDetails,
                status: "needs_update",
                previous_price_cents: prior.price_cents,
                previous_description: prior.description,
              })
              .eq("source_profile_url", data.sourceProfileUrl)
              .eq("source_url", item.sourceUrl)
              .eq("status", "published");
            if (error) throw error;
            updated += 1;
            continue;
          }

          try {
            if (recapture && !item.description)
              throw new Error("Fresh source description required to recapture this listing.");
            phase = "photo";
            if (recapture && item.photoUrls.length === 0)
              throw new Error("Fresh source photos required to recapture this listing.");
            const stagingPaths: string[] = [];
            for (const url of item.photoUrls)
              stagingPaths.push(await downloadPhoto(admin, batch.id, url));
            phase = "write";
            const draft = {
              batch_id: batch.id,
              source_profile_url: data.sourceProfileUrl,
              seller_id: managed?.owner_user_id ?? prior?.seller_id ?? null,
              source_url: item.sourceUrl,
              title: item.title,
              description: item.description,
              price_cents: item.priceCents,
              condition: item.condition,
              category_slug: item.categorySlug,
              item_details: item.itemDetails,
              city: item.city || (recapture ? prior.city : ""),
              state: item.state || (recapture ? prior.state : ""),
              region: item.region || (recapture ? prior.region : ""),
              evidence_paths: stagingPaths,
              public_paths: stagingPaths,
              status: "draft",
            };
            if (recapture) {
              const { data: changedRows, error } = await admin
                .from("fb_marketplace_import_items")
                .update({ ...draft, removed_reason: null, sync_conflict: null })
                .eq("id", prior.id)
                .eq("status", "discarded")
                .is("listing_id", null)
                .select("id");
              if (error) throw error;
              if (!changedRows?.length) continue;
              recaptured++;
            } else {
              const { error } = await admin.from("fb_marketplace_import_items").upsert(draft, {
                onConflict: "source_profile_url,source_url",
                ignoreDuplicates: true,
              });
              if (error) throw error;
            }
            staged += 1;
          } catch (error) {
            failed += 1;
            failedUrls.push(item.sourceUrl);
            failures.push({ rowIndex, reason: stagingFailureCode(error, phase) });
          }
        } catch (error) {
          failed += 1;
          failedUrls.push(item.sourceUrl);
          failures.push({ rowIndex, reason: stagingFailureCode(error, phase) });
        }
      }

      // Legacy clients may still send finalizeScan/seenUrls. They are accepted
      // for compatibility, but absence can never queue or apply a removal.
      return {
        batchId: batch.id,
        staged,
        updated,
        failed,
        failedUrls,
        failures,
        flaggedRemoved,
        preservedActive,
        recaptured,
      };
    },
  );

export const getFacebookImportItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FbImportItem[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { allImportRows } = await import("./import-pagination.server");
    const rows = await allImportRows(() =>
      admin
        .from("fb_marketplace_import_items")
        .select(
          "id,batch_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,public_paths,status,previous_price_cents,previous_description,listing_id,created_at,sync_conflict,item_details,last_applied_snapshot,listing:asks!listing_id(status)",
          { count: "exact" },
        )
        .in("status", ["draft", "needs_update", "possibly_removed"])
        .order("id"),
    );
    const { data: archives, error: archiveError } = await admin
      .from("import_source_archives")
      .select("source_profile_url")
      .not("archived_at", "is", null);
    if (archiveError) throw new Error(archiveError.message);
    const archived = new Set((archives ?? []).map((r: any) => r.source_profile_url));
    const visibleRows = rows.filter(
      (r: any) => !archived.has(r.source_profile_url) && !isSettledImportRemoval(r),
    );
    const allPaths = visibleRows.flatMap((row: any) => (row.public_paths as string[] | null) ?? []);
    const signedByPath = await signStagedPhotos(admin, allPaths);
    return visibleRows.map((row: any) => {
      const publicPaths: string[] = row.public_paths ?? [];
      return {
        id: row.id,
        batchId: row.batch_id,
        sourceProfileUrl: row.source_profile_url,
        syncConflict: row.sync_conflict,
        sourceUrl: row.source_url,
        title: row.title,
        description: row.description,
        priceCents: Number(row.price_cents),
        // Older staged rows were saved before Facebook category/condition
        // normalization existed. Present the same normalized values used by
        // new imports so the review form does not force an admin to repair
        // every row by hand.
        condition: normalizeFacebookCondition(row.condition),
        categorySlug: inferFacebookCategorySlug(
          row.category_slug,
          row.title,
          categoryHintFrom(row.source_profile_url, row.description),
        ),
        itemDetails: inferImportItemDetails(
          row.category_slug,
          undefined,
          row.item_details,
          row.title,
        ),
        city: row.city ?? "",
        state: row.state ?? "",
        region: row.region ?? "",
        publicPaths,
        photoUrls: publicPaths.map((path) => signedByPath.get(path)).filter(Boolean) as string[],
        status: row.status,
        previousPriceCents:
          row.previous_price_cents == null ? null : Number(row.previous_price_cents),
        previousDescription: row.previous_description,
        listingId: row.listing_id,
        createdAt: row.created_at,
      };
    });
  });

export type FbImportProfile = {
  sourceProfileUrl: string;
  sellerName: string | null;
  lastStagedAt: string;
  openCount: number;
  publishedCount: number;
  offlineCount: number;
  /** The seller's storefront slug once a listing has been published for them. */
  sellerSlug: string | null;
  /** True when the seller paused sync; scans must skip them before opening any source page. */
  syncPaused: boolean;
  archivedAt: string | null;
};

/** One row per Facebook profile that's been imported, with when it was last
 * staged -- so the admin can see which sellers are due for a refresh. */
export const getFacebookImportProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FbImportProfile[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { allImportRows } = await import("./import-pagination.server");
    const batches = await allImportRows(() =>
      admin
        .from("fb_marketplace_import_batches")
        .select("source_profile_url,seller_name,created_at,id", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id"),
    );
    const items = await allImportRows(() =>
      admin
        .from("fb_marketplace_import_items")
        .select(
          "source_profile_url,status,seller_id,id,listing_id,last_applied_snapshot,listing:asks!listing_id(status)",
          { count: "exact" },
        )
        .order("id"),
    );
    const counts = countImportedSellerListings(items ?? []);
    const sellerByProfile = new Map<string, string>();
    for (const row of items ?? []) {
      if (row.seller_id && !sellerByProfile.has(row.source_profile_url)) {
        sellerByProfile.set(row.source_profile_url, row.seller_id);
      }
    }

    const namesByProfile = new Map<string, string>();
    for (const batch of batches ?? []) {
      if (batch.seller_name && !namesByProfile.has(batch.source_profile_url)) {
        namesByProfile.set(batch.source_profile_url, batch.seller_name);
      }
    }

    const sellerIds = [...new Set(sellerByProfile.values())];
    const { data: sellerRows } = sellerIds.length
      ? await admin.from("seller_profiles").select("user_id, slug").in("user_id", sellerIds)
      : { data: [] };
    const slugBySeller = new Map<string, string>(
      (sellerRows ?? []).map((row: { user_id: string; slug: string }) => [row.user_id, row.slug]),
    );

    // Paused sellers are surfaced so scans skip them before any source page
    // is opened; staging still rejects them server-side as a backstop.
    const { data: pausedRows, error: pausedError } = await admin
      .from("managed_import_sellers")
      .select("source_profile_url")
      .eq("sync_enabled", false);
    if (pausedError) throw new Error(pausedError.message);
    const pausedProfiles = new Set<string>(
      (pausedRows ?? []).map((row: { source_profile_url: string }) => row.source_profile_url),
    );

    const { data: archives, error: archiveError } = await admin
      .from("import_source_archives")
      .select("source_profile_url,archived_at")
      .not("archived_at", "is", null);
    if (archiveError) throw new Error(archiveError.message);
    const archivedByProfile = new Map<string, string>(
      (archives ?? []).map((r: any) => [r.source_profile_url, r.archived_at]),
    );
    const profiles = new Map<string, FbImportProfile>();
    for (const batch of batches ?? []) {
      if (profiles.has(batch.source_profile_url)) continue;
      const entry = counts.get(batch.source_profile_url) ?? { open: 0, published: 0, offline: 0 };
      profiles.set(batch.source_profile_url, {
        sourceProfileUrl: batch.source_profile_url,
        sellerName: namesByProfile.get(batch.source_profile_url) ?? null,
        lastStagedAt: batch.created_at,
        openCount: entry.open,
        publishedCount: entry.published,
        offlineCount: entry.offline,
        sellerSlug: slugBySeller.get(sellerByProfile.get(batch.source_profile_url) ?? "") ?? null,
        syncPaused: pausedProfiles.has(batch.source_profile_url),
        archivedAt: archivedByProfile.get(batch.source_profile_url) ?? null,
      });
    }
    return Array.from(profiles.values());
  });

export type FbRefreshTarget = {
  sourceProfileUrl: string;
  sourceUrl: string;
  title: string;
  priceCents: number;
};

/** The published listings a refresh should re-check. */
export const getFacebookRefreshTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FbRefreshTarget[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { allImportRows } = await import("./import-pagination.server");
    const data = await allImportRows(() =>
      (supabaseAdmin as any)
        .from("fb_marketplace_import_items")
        .select(
          "source_profile_url,source_url,title,price_cents,id,listing:asks!listing_id(status)",
          { count: "exact" },
        )
        .in("status", ["published", "discarded"])
        .order("id"),
    );
    const { data: paused, error: pauseError } = await (supabaseAdmin as any)
      .from("managed_import_sellers")
      .select("source_profile_url")
      .eq("sync_enabled", false);
    if (pauseError) throw new Error(pauseError.message);
    const { data: archives, error: archiveError } = await (supabaseAdmin as any)
      .from("import_source_archives")
      .select("source_profile_url")
      .not("archived_at", "is", null);
    if (archiveError) throw new Error(archiveError.message);
    const pausedProfiles = new Set(
      [...(paused ?? []), ...(archives ?? [])].map((p: any) => p.source_profile_url),
    );
    return (data ?? [])
      .filter(
        (row: any) =>
          !pausedProfiles.has(row.source_profile_url) && row.listing?.status === "active",
      )
      .map((row: any) => ({
        sourceProfileUrl: row.source_profile_url,
        sourceUrl: row.source_url,
        title: row.title,
        priceCents: Number(row.price_cents),
      }));
  });

export const updateFacebookImportItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      itemId: string;
      title: string;
      description: string;
      priceCents: number;
      condition: string;
      categorySlug: string;
      subcategory?: string;
      itemDetails?: Record<string, string>;
      city: string;
      state: string;
      region: string;
    }) => ({
      itemId: String(input.itemId),
      title: String(input.title).trim().slice(0, 120),
      description: String(input.description ?? "")
        .trim()
        .slice(0, 5000),
      priceCents: Math.max(0, Math.round(Number(input.priceCents) || 0)),
      condition: String(input.condition ?? "used_good"),
      categorySlug: String(input.categorySlug ?? "general"),
      itemDetails: inferImportItemDetails(
        String(input.categorySlug ?? "general"),
        input.subcategory,
        input.itemDetails,
        input.title,
      ),
      city: String(input.city ?? "")
        .trim()
        .slice(0, 80),
      state: String(input.state ?? "")
        .trim()
        .slice(0, 80),
      region: String(input.region ?? "")
        .trim()
        .slice(0, 80),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    // Idaho items use the listed city spelling and that city's region.
    if (data.state.toUpperCase() === "ID") {
      const place = findIdahoPlace(data.city);
      if (!place) throw new Error("Choose a city from the list of Idaho cities and towns.");
      Object.assign(data, { city: place[0], state: "ID", region: place[1] });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("fb_marketplace_import_items")
      .update({
        title: data.title,
        description: data.description || null,
        price_cents: data.priceCents,
        condition: data.condition,
        category_slug: data.categorySlug,
        item_details: data.itemDetails,
        city: data.city,
        state: data.state,
        region: data.region,
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const discardFacebookImportItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { itemId: string }) => ({ itemId: String(input.itemId) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("fb_marketplace_import_items")
      .update({ status: "discarded" })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Sets one category on several import items at once, and on the live
 * listing of any that are already published, so a batch the readers sorted
 * badly can be fixed in one step instead of item by item.
 */
export const setFacebookImportItemsCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { itemIds: string[]; categorySlug: string }) => {
    const itemIds = (Array.isArray(input?.itemIds) ? input.itemIds : [])
      .map((id) => String(id))
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (itemIds.length > 100) throw new Error("Apply bulk edits in batches of at most 100 rows.");
    const categorySlug = String(input?.categorySlug ?? "");
    if (!classifiedCategories.some((category) => category.slug === categorySlug))
      throw new Error("Choose a category.");
    if (!itemIds.length) throw new Error("Select at least one listing.");
    return { itemIds, categorySlug };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", data.categorySlug)
      .maybeSingle();
    if (categoryError || !category) throw new Error("That category isn't set up.");
    const { data: items, error } = await admin
      .from("fb_marketplace_import_items")
      .update({ category_slug: data.categorySlug, item_details: {} })
      .in("id", data.itemIds)
      .select("listing_id");
    if (error) throw new Error(error.message);
    return { items: (items ?? []).length, listingsUpdated: 0 };
  });

/**
 * Puts one Idaho city (and its region) on several staged items at once.
 * Vinted and Whatnot often don't show where a seller is, so a whole batch
 * can arrive without a city. With onlyMissing, items that already have a
 * city keep it.
 */
export const setFacebookImportItemsCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { itemIds: string[]; city: string; onlyMissing?: boolean }) => {
    const itemIds = (Array.isArray(input?.itemIds) ? input.itemIds : [])
      .map((id) => String(id))
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (itemIds.length > 100) throw new Error("Apply bulk edits in batches of at most 100 rows.");
    const place = findIdahoPlace(String(input?.city ?? ""));
    if (!place) throw new Error("Choose a city from the list of Idaho cities and towns.");
    if (!itemIds.length) throw new Error("Select at least one listing.");
    return { itemIds, city: place[0], region: place[1], onlyMissing: input?.onlyMissing !== false };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("fb_marketplace_import_items")
      .update({ city: data.city, state: "ID", region: data.region })
      .in("id", data.itemIds)
      .in("status", ["draft", "needs_update"]);
    if (data.onlyMissing) query = query.or("city.is.null,city.eq.");
    const { data: items, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return { items: (items ?? []).length, city: data.city };
  });

export const discardAllFacebookImportItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: archives, error: archiveError } = await admin
      .from("import_source_archives")
      .select("source_profile_url")
      .not("archived_at", "is", null);
    if (archiveError) throw new Error(archiveError.message);
    let query = admin
      .from("fb_marketplace_import_items")
      .update({ status: "discarded" })
      .in("status", ["draft", "needs_update", "possibly_removed"]);
    // Clear only the visible queue, so removed imports remain recoverable.
    if (archives?.length)
      query = query.not(
        "source_profile_url",
        "in",
        `(${archives.map((r: any) => JSON.stringify(r.source_profile_url)).join(",")})`,
      );
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return { cleared: (data ?? []).length };
  });

export const publishFacebookImportItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      itemIds: string[];
      sellerEmail?: string;
      sellerDisplayName?: string;
      mode?: "managed" | "linked";
      authorized: boolean;
    }) => {
      if (input.authorized !== true)
        throw new Error(
          "Confirm that the seller authorized importing and managing these listings.",
        );
      return {
        itemIds: z.array(z.string().uuid()).min(1).max(1).parse(input.itemIds),
        sellerEmail: String(input.sellerEmail ?? "")
          .trim()
          .toLowerCase(),
        sellerDisplayName: String(input.sellerDisplayName ?? "").trim(),
        mode: input.mode ?? "managed",
      };
    },
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      created: number;
      updated: number;
      removed: number;
      errors: number;
      failures: string[];
      itemFailures: { itemId: string; message: string }[];
      claimUrl?: string;
      expiresAt?: string;
    }> => {
      await requireAdmin(context);
      if (!data.itemIds.length) throw new Error("Select at least one listing.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const { data: items, error } = await admin
        .from("fb_marketplace_import_items")
        .select("*")
        .in("id", data.itemIds);
      if (error) throw new Error(error.message);
      if (items?.length !== data.itemIds.length)
        throw new Error("Some selected items are no longer available. Refresh and retry.");
      if (items.some((item: any) => item.status === "possibly_removed"))
        throw new Error(
          "Import refresh cannot take listings offline. Review the original listing and use Bluebird's separate removal action.",
        );
      const profiles = new Set(
        items.map((i: any) => canonicalSellerSourceProfile(i.source_profile_url)),
      );
      if (profiles.size !== 1) throw new Error("Select listings from one seller at a time.");
      // Whatnot doesn't show where a seller is; every listing needs a city.
      const noCity = items.filter(
        (i: any) => i.status !== "possibly_removed" && !String(i.city ?? "").trim(),
      );
      if (noCity.length)
        throw new Error(
          `Set a city before publishing: ${noCity
            .slice(0, 3)
            .map((i: any) => i.title)
            .join("; ")}${noCity.length > 3 ? ` and ${noCity.length - 3} more` : ""}.`,
        );
      for (const item of items) {
        if (item.status === "published") continue;
        const details = inferImportItemDetails(
          item.category_slug,
          undefined,
          item.item_details,
          item.title,
        );
        if (JSON.stringify(details) !== JSON.stringify(item.item_details ?? {})) {
          const { error: detailError } = await admin
            .from("fb_marketplace_import_items")
            .update({ item_details: details })
            .eq("id", item.id);
          if (detailError) throw new Error(detailError.message);
        }
      }
      const profile = canonicalSellerSourceProfile(items[0].source_profile_url);
      const { data: batch } = await admin
        .from("fb_marketplace_import_batches")
        .select("seller_name")
        .eq("source_profile_url", profile)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const name = data.sellerDisplayName || batch?.seller_name || "Seller";
      const { ensureManagedImportSeller } = await import("./seller-claims.server");
      // Existing-account publication resolves only a real account. It never creates
      // an account, confirms email, resets credentials, or accepts seller terms.
      if (data.mode === "linked") {
        const { data: managed } = await admin
          .from("managed_import_sellers")
          .select("id")
          .eq("source_profile_url", profile)
          .maybeSingle();
        if (!managed) {
          if (!data.sellerEmail) throw new Error("Enter the existing seller's account email.");
          let user: any = null;
          for (let page = 1; !user; page++) {
            const { data: users, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
            if (error) throw new Error(error.message);
            user = users.users.find((u: any) => u.email?.toLowerCase() === data.sellerEmail);
            if (user || users.users.length < 200) break;
          }
          if (!user?.email_confirmed_at)
            throw new Error(
              "The seller needs an existing verified account. Use a claim link for a new seller.",
            );
          const { data: setup } = await admin
            .from("seller_profiles")
            .select("terms_accepted_at,status")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!setup?.terms_accepted_at || setup.status !== "active")
            throw new Error("The existing seller must finish seller setup first.");
          const { data: prior } = await admin
            .from("fb_marketplace_import_items")
            .select("seller_id")
            .eq("source_profile_url", profile)
            .not("seller_id", "is", null);
          if (prior?.some((i: any) => i.seller_id !== user.id))
            throw new Error("This imported profile is already linked to another account.");
          const { error: registerError } = await admin.rpc("register_managed_import_seller", {
            _profile: profile,
            _name: name,
            _candidate: user.id,
            _actor: context.userId,
            _linked: true,
          });
          if (registerError) throw new Error(registerError.message);
        }
      }
      const seller = await ensureManagedImportSeller(
        profile,
        name,
        context.userId,
        data.mode === "linked",
      );
      // Existing ownership determines routing; applying an update never reassigns it.
      if (data.mode === "linked" || seller.claimed_at) {
        const [{ data: owner }, { data: setup }] = await Promise.all([
          admin.auth.admin.getUserById(seller.owner_user_id),
          admin
            .from("seller_profiles")
            .select("terms_accepted_at,status")
            .eq("user_id", seller.owner_user_id)
            .maybeSingle(),
        ]);
        if (owner?.user?.app_metadata?.managed_import === true)
          throw new Error(
            "This seller has not claimed an account yet. Choose New seller — create claim link.",
          );
        if (
          !owner?.user?.email_confirmed_at ||
          (owner.user.banned_until && Date.parse(owner.user.banned_until) > Date.now()) ||
          !setup?.terms_accepted_at ||
          setup.status !== "active"
        )
          throw new Error(
            "The linked seller must verify their email and complete seller setup first.",
          );
      }
      let created = 0,
        updated = 0,
        removed = 0;
      const failures: string[] = [];
      const itemFailures: { itemId: string; message: string }[] = [];
      for (const item of items) {
        try {
          if (item.status === "discarded") throw new Error("This listing was discarded.");
          // Managed application locks and revalidates the row inside the database.
          const paths =
            item.status === "draft" && !item.listing_id
              ? await claimPhotosForSeller(admin, seller.owner_user_id, item.evidence_paths)
              : null;
          const { data: listingId, error: applyError } = await admin.rpc(
            "apply_managed_import_item",
            { _item: item.id, _actor: context.userId, _paths: paths },
          );
          if (applyError) throw new Error(applyError.message);
          if (!listingId)
            throw new Error(
              "Bluebird changes conflict with this sync. Keep the Bluebird version or review the listing.",
            );
          if (item.status === "draft") created++;
          else if (item.status === "needs_update") updated++;
          else if (item.status === "possibly_removed") removed++;
          const { pingListingChange } = await import("./landing-pages.server");
          void pingListingChange(String(listingId));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Import failed; retry.";
          failures.push(`${item.title}: ${message}`);
          itemFailures.push({ itemId: item.id, message });
        }
      }
      // Applying or retrying rows never rotates a bearer claim. The existing
      // explicit Prepare claim control is the only link issuance operation.
      return {
        created,
        updated,
        removed,
        errors: failures.length,
        failures,
        itemFailures,
      };
    },
  );

/** Reversible removal: only stops this source and hides its queue; public data stays intact. */
export const setFacebookImportSourceArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { profile: string; archived: boolean }) => ({
    profile: canonicalSellerSourceProfile(input.profile),
    archived: z.boolean().parse(input.archived),
  }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("set_import_source_archived", {
      _profile: data.profile,
      _actor: context.userId,
      _archived: data.archived,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

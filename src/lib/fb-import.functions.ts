/* eslint-disable @typescript-eslint/no-explicit-any -- generated Supabase types lag newly applied tables until the next type generation */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  inferFacebookCategorySlug,
  normalizeFacebookCondition,
} from "@/lib/fb-import-normalization";

import { canonicalSellerSourceProfile } from "./seller-claims";
import { findIdahoPlace } from "@/config/idaho-places";

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
  if (!unique.length) return new Map();
  const { data, error } = await admin.storage.from("listing-media").createSignedUrls(unique, 3600);
  if (error) return new Map();
  return new Map(
    (data ?? [])
      .filter((item: any) => item.path && item.signedUrl)
      .map((item: any) => [item.path as string, item.signedUrl as string]),
  );
}

/**
 * Downloads a photo into a seller-agnostic staging path. The seller account
 * doesn't exist yet at stage time (Facebook never exposes an email to
 * resolve one from), but create_classified_listing checks that every photo
 * path's first segment is the caller's own uid -- so these get copied to a
 * real `${sellerId}/...` path at publish time, once a seller is known.
 */
async function downloadPhoto(admin: any, batchId: string, url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download photo (${response.status})`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("URL did not return an image.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new Error("Photo is larger than 12 MB.");
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `_staging/${batchId}/${crypto.randomUUID()}.${ext}`;
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
  return prepareImportPhotos(admin, sellerId, stagingPaths);
}

type RemovedReason = "sold" | "unavailable" | "missing";

// removed_reason is read and written on its own and failures are ignored, so
// imports keep working (as plain take-downs) if its migration hasn't run.
async function recordRemovedReason(
  admin: any,
  sourceProfileUrl: string,
  sourceUrl: string,
  reason: RemovedReason,
) {
  const { error } = await admin
    .from("fb_marketplace_import_items")
    .update({ removed_reason: reason })
    .eq("source_profile_url", sourceProfileUrl)
    .eq("source_url", sourceUrl);
  if (error) console.warn("Could not record why an import was flagged", error.message);
}

export const stageFacebookImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      sourceProfileUrl: string;
      sellerName?: string | undefined;
      mode?: "refresh" | undefined;
      items: FbImportItemInput[];
    }) => {
      const sourceProfileUrl = canonicalSellerSourceProfile(String(input.sourceProfileUrl ?? ""));
      if (!sourceProfileUrl) throw new Error("Enter the Facebook Marketplace profile URL.");
      const sellerName =
        String(input.sellerName ?? "")
          .trim()
          .slice(0, 120) || null;
      const items = (input.items ?? []).map((item) => {
        const categorySlug = inferFacebookCategorySlug(
          item.categorySlug,
          item.title,
          item.description,
        );
        const state = item.state ? String(item.state).trim().slice(0, 80) : "";
        const city = item.city ? String(item.city).trim().slice(0, 80) : "";
        // Idaho cities use the listed spelling, and that city's region.
        const place = /^(id|idaho)$/i.test(state) ? findIdahoPlace(city) : undefined;
        return {
        sourceUrl: String(item.sourceUrl ?? "").trim(),
        title: String(item.title ?? "")
          .trim()
          .slice(0, 120),
        description: item.description ? String(item.description).trim().slice(0, 5000) : null,
        priceCents: Math.max(0, Math.round(Number(item.priceCents) || 0)),
        // Animals have no item condition.
        condition:
          categorySlug === "pets" ? "not_applicable" : normalizeFacebookCondition(item.condition),
        categorySlug,
        city: place ? place[0] : city,
        state: place ? "ID" : state,
        region: place ? place[1] : "",
        photoUrls: (item.photoUrls ?? []).filter(Boolean).slice(0, 8),
        unavailable: item.unavailable === true,
        sold: item.sold === true,
        };
      });
      if (!items.length) throw new Error("No listings were provided.");
      if (items.some((item) => !item.sourceUrl || !item.title))
        throw new Error("Every listing needs a source URL and a title.");
      return { sourceProfileUrl, sellerName, mode: input.mode, items };
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
      flaggedRemoved: number;
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

      const { data: batch, error: batchError } = await admin
        .from("fb_marketplace_import_batches")
        .insert({
          imported_by: context.userId,
          source_profile_url: data.sourceProfileUrl,
          seller_name: data.sellerName,
        })
        .select("id")
        .single();
      if (batchError) throw new Error(batchError.message);

      const { data: priorItems, error: priorError } = await admin
        .from("fb_marketplace_import_items")
        .select("source_url, status, price_cents, description, listing_id, seller_id")
        .eq("source_profile_url", data.sourceProfileUrl)
        .in("status", ["draft", "needs_update", "possibly_removed", "published"]);
      if (priorError) throw new Error(priorError.message);
      const priorByUrl = new Map<string, any>(
        (priorItems ?? []).map((row: any) => [row.source_url, row]),
      );
      const seenUrls = new Set<string>();

      let staged = 0;
      let updated = 0;
      let failed = 0;
      let flaggedRemoved = 0;
      const isRefresh = data.mode === "refresh";

      for (const item of data.items) {
        seenUrls.add(item.sourceUrl);
        const prior = priorByUrl.get(item.sourceUrl);

        // A refresh only re-checks listings that are already published, and
        // only touches what Facebook can actually have changed. Category,
        // condition and location are left exactly as the admin set them.
        if (isRefresh) {
          if (!prior || prior.status !== "published") continue;
          if (item.unavailable) {
            const { error } = await admin
              .from("fb_marketplace_import_items")
              .update({ batch_id: batch.id, status: "possibly_removed" })
              .eq("source_profile_url", data.sourceProfileUrl)
              .eq("source_url", item.sourceUrl);
            if (error) throw new Error(error.message);
            await recordRemovedReason(
              admin,
              data.sourceProfileUrl,
              item.sourceUrl,
              item.sold ? "sold" : "unavailable",
            );
            flaggedRemoved += 1;
            continue;
          }
          const changed =
            prior.price_cents !== item.priceCents ||
            (prior.description ?? "") !== (item.description ?? "");
          if (!changed) continue;
          const { error } = await admin
            .from("fb_marketplace_import_items")
            .update({
              batch_id: batch.id,
              title: item.title,
              description: item.description,
              price_cents: item.priceCents,
              status: "needs_update",
              previous_price_cents: prior.price_cents,
              previous_description: prior.description,
            })
            .eq("source_profile_url", data.sourceProfileUrl)
            .eq("source_url", item.sourceUrl);
          if (error) throw new Error(error.message);
          updated += 1;
          continue;
        }

        if (prior && prior.status === "published") {
          const changed =
            prior.price_cents !== item.priceCents ||
            (prior.description ?? "") !== (item.description ?? "");
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
              status: "needs_update",
              previous_price_cents: prior.price_cents,
              previous_description: prior.description,
            })
            .eq("source_profile_url", data.sourceProfileUrl)
            .eq("source_url", item.sourceUrl);
          if (error) throw new Error(error.message);
          updated += 1;
          continue;
        }

        try {
          const stagingPaths = await Promise.all(
            item.photoUrls.map((url) => downloadPhoto(admin, batch.id, url)),
          );
          const { error } = await admin.from("fb_marketplace_import_items").upsert(
            {
              batch_id: batch.id,
              source_profile_url: data.sourceProfileUrl,
              seller_id: managed?.owner_user_id ?? prior?.seller_id ?? null,
              source_url: item.sourceUrl,
              title: item.title,
              description: item.description,
              price_cents: item.priceCents,
              condition: item.condition,
              category_slug: item.categorySlug,
              city: item.city,
              state: item.state,
              region: item.region,
              evidence_paths: stagingPaths,
              public_paths: stagingPaths,
              status: "draft",
            },
            { onConflict: "source_profile_url,source_url" },
          );
          if (error) throw new Error(error.message);
          staged += 1;
        } catch {
          failed += 1;
        }
      }

      // Absence only means "removed" after a full profile scrape. A refresh
      // reads a handful of known listings, so a missing one just means it
      // wasn't read -- never a reason to flag it.
      const vanished = isRefresh
        ? []
        : (priorItems ?? []).filter(
            (row: any) => row.status === "published" && !seenUrls.has(row.source_url),
          );
      for (const row of vanished) {
        const { error } = await admin
          .from("fb_marketplace_import_items")
          .update({ batch_id: batch.id, status: "possibly_removed" })
          .eq("source_profile_url", data.sourceProfileUrl)
          .eq("source_url", row.source_url);
        if (error) throw new Error(error.message);
        await recordRemovedReason(admin, data.sourceProfileUrl, row.source_url, "missing");
      }

      return { batchId: batch.id, staged, updated, failed, flaggedRemoved };
    },
  );

export const getFacebookImportItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FbImportItem[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin
      .from("fb_marketplace_import_items")
      .select(
        "id,batch_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,public_paths,status,previous_price_cents,previous_description,listing_id,created_at,sync_conflict",
      )
      .in("status", ["draft", "needs_update", "possibly_removed"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const allPaths = rows.flatMap((row: any) => (row.public_paths as string[] | null) ?? []);
    const signedByPath = await signStagedPhotos(admin, allPaths);
    return rows.map((row: any) => {
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
        categorySlug: inferFacebookCategorySlug(row.category_slug, row.title, row.description),
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
  /** The seller's storefront slug once a listing has been published for them. */
  sellerSlug: string | null;
};

/** One row per Facebook profile that's been imported, with when it was last
 * staged -- so the admin can see which sellers are due for a refresh. */
export const getFacebookImportProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FbImportProfile[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: batches, error: batchError } = await admin
      .from("fb_marketplace_import_batches")
      .select("source_profile_url, seller_name, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (batchError) throw new Error(batchError.message);

    const { data: items, error: itemError } = await admin
      .from("fb_marketplace_import_items")
      .select("source_profile_url, status, seller_id")
      .neq("status", "discarded");
    if (itemError) throw new Error(itemError.message);

    const counts = new Map<string, { open: number; published: number }>();
    const sellerByProfile = new Map<string, string>();
    for (const row of items ?? []) {
      if (row.seller_id && !sellerByProfile.has(row.source_profile_url)) {
        sellerByProfile.set(row.source_profile_url, row.seller_id);
      }
      const entry = counts.get(row.source_profile_url) ?? { open: 0, published: 0 };
      if (row.status === "published") entry.published += 1;
      else entry.open += 1;
      counts.set(row.source_profile_url, entry);
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

    const profiles = new Map<string, FbImportProfile>();
    for (const batch of batches ?? []) {
      if (profiles.has(batch.source_profile_url)) continue;
      const entry = counts.get(batch.source_profile_url) ?? { open: 0, published: 0 };
      profiles.set(batch.source_profile_url, {
        sourceProfileUrl: batch.source_profile_url,
        sellerName: namesByProfile.get(batch.source_profile_url) ?? null,
        lastStagedAt: batch.created_at,
        openCount: entry.open,
        publishedCount: entry.published,
        sellerSlug: slugBySeller.get(sellerByProfile.get(batch.source_profile_url) ?? "") ?? null,
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
    const { data, error } = await (supabaseAdmin as any)
      .from("fb_marketplace_import_items")
      .select("source_profile_url, source_url, title, price_cents")
      .eq("status", "published");
    if (error) throw new Error(error.message);
    const { data: paused, error: pauseError } = await (supabaseAdmin as any)
      .from("managed_import_sellers")
      .select("source_profile_url")
      .eq("sync_enabled", false);
    if (pauseError) throw new Error(pauseError.message);
    const pausedProfiles = new Set((paused ?? []).map((p: any) => p.source_profile_url));
    return (data ?? [])
      .filter((row: any) => !pausedProfiles.has(row.source_profile_url))
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

export const discardAllFacebookImportItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data, error } = await admin
      .from("fb_marketplace_import_items")
      .update({ status: "discarded" })
      .in("status", ["draft", "needs_update", "possibly_removed"])
      .select("id");
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
        itemIds: [...new Set((input.itemIds ?? []).map(String))],
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
      const profiles = new Set(
        items.map((i: any) => canonicalSellerSourceProfile(i.source_profile_url)),
      );
      if (profiles.size !== 1)
        throw new Error("Select listings from one seller at a time.");
      const profile = canonicalSellerSourceProfile(items[0].source_profile_url);
      const { data: batch } = await admin
        .from("fb_marketplace_import_batches")
        .select("seller_name")
        .eq("source_profile_url", profile)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const name = data.sellerDisplayName || batch?.seller_name || "Seller";
      const { ensureManagedImportSeller, issueSellerClaimLink } =
        await import("./seller-claims.server");
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
      if (data.mode === "managed" && seller.claimed_at)
        throw new Error(
          "This seller already claimed their account. Choose Existing linked seller.",
        );
      if (data.mode === "linked") {
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
        } catch (error) {
          const message = error instanceof Error ? error.message : "Import failed; retry.";
          failures.push(`${item.title}: ${message}`);
          itemFailures.push({ itemId: item.id, message });
        }
      }
      let link: { url: string; expiresAt: string } | undefined;
      if (data.mode === "managed" && !seller.claimed_at && created + updated + removed > 0)
        link = await issueSellerClaimLink(seller.id, context.userId);
      return {
        created,
        updated,
        removed,
        errors: failures.length,
        failures,
        itemFailures,
        claimUrl: link?.url,
        expiresAt: link?.expiresAt,
      };
    },
  );

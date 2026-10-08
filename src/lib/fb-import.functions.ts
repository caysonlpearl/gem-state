/* eslint-disable @typescript-eslint/no-explicit-any -- generated Supabase types lag newly applied tables until the next type generation */
import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Administrator access required.");
}

function supabaseUrl(): string {
  const url = process.env["GEM_STATE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  if (!url) throw new Error("Missing SUPABASE_URL.");
  return url;
}

function supabasePublishableKey(): string {
  const key =
    process.env["GEM_STATE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!key) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY.");
  return key;
}

/**
 * Finds the auth user for an email, creating one if they don't have a GemList
 * account yet. This onboards a real, consenting seller -- never a bypass of
 * the normal "must be signed in to sell" rule.
 */
async function findOrCreateAuthUser(admin: any, email: string): Promise<string> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!createError && created?.user) return created.user.id;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`Could not find or create an account for ${email}.`);
}

function slugCandidate(displayName: string, email: string, suffix: number): string {
  const source = displayName.trim() || email.split("@")[0] || "seller";
  const base =
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "seller";
  return suffix === 0 ? base : `${base}-${suffix}`;
}

async function ensureUniqueSlug(admin: any, displayName: string, email: string): Promise<string> {
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = slugCandidate(displayName, email, suffix);
    const { data, error } = await admin
      .from("seller_profiles")
      .select("user_id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique seller handle.");
}

/**
 * Resolves (or creates, with a real seller profile) the GemList account that
 * imported listings get published under. Called once per publish, when an
 * admin finally supplies the seller's email -- staging itself never needs
 * one, since Facebook doesn't expose a seller's email address at all.
 */
async function resolveImportSellerAccount(
  admin: any,
  email: string,
  displayName: string,
): Promise<{ sellerId: string; slug: string }> {
  const userId = await findOrCreateAuthUser(admin, email);

  await admin
    .from("profiles")
    .upsert({ id: userId, display_name: displayName }, { onConflict: "id" });

  const { data: existing, error: existingError } = await admin
    .from("seller_profiles")
    .select("slug")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { sellerId: userId, slug: existing.slug };

  const slug = await ensureUniqueSlug(admin, displayName, email);
  const { error: insertError } = await admin.from("seller_profiles").insert({
    user_id: userId,
    slug,
    status: "active",
    terms_version: "seller-v1",
    terms_accepted_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(insertError.message);
  return { sellerId: userId, slug };
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
  const claimed: string[] = [];
  for (const stagingPath of stagingPaths) {
    const ext = stagingPath.split(".").pop() || "jpg";
    const newPath = `${sellerId}/${crypto.randomUUID()}.${ext}`;
    const evidenceCopy = await admin.storage.from("ask-evidence").copy(stagingPath, newPath);
    if (evidenceCopy.error) throw new Error(`Could not claim photo: ${evidenceCopy.error.message}`);
    const publicCopy = await admin.storage.from("listing-media").copy(stagingPath, newPath);
    if (publicCopy.error) throw new Error(`Could not claim photo: ${publicCopy.error.message}`);
    claimed.push(newPath);
  }
  return claimed;
}

export const stageFacebookImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      sourceProfileUrl: string;
      sellerName?: string | undefined;
      items: FbImportItemInput[];
    }) => {
      const sourceProfileUrl = String(input.sourceProfileUrl ?? "").trim();
      if (!sourceProfileUrl) throw new Error("Enter the Facebook Marketplace profile URL.");
      const sellerName =
        String(input.sellerName ?? "")
          .trim()
          .slice(0, 120) || null;
      const items = (input.items ?? []).map((item) => ({
        sourceUrl: String(item.sourceUrl ?? "").trim(),
        title: String(item.title ?? "")
          .trim()
          .slice(0, 120),
        description: item.description ? String(item.description).trim().slice(0, 5000) : null,
        priceCents: Math.max(0, Math.round(Number(item.priceCents) || 0)),
        condition: item.condition ? String(item.condition).trim() : null,
        categorySlug: String(item.categorySlug ?? "general"),
        city: item.city ? String(item.city).trim().slice(0, 80) : "",
        state: item.state ? String(item.state).trim().slice(0, 80) : "",
        photoUrls: (item.photoUrls ?? []).filter(Boolean).slice(0, 8),
      }));
      if (!items.length) throw new Error("No listings were provided.");
      if (items.some((item) => !item.sourceUrl || !item.title))
        throw new Error("Every listing needs a source URL and a title.");
      return { sourceProfileUrl, sellerName, items };
    },
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ batchId: string; staged: number; updated: number; failed: number }> => {
      await requireAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

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

      for (const item of data.items) {
        seenUrls.add(item.sourceUrl);
        const prior = priorByUrl.get(item.sourceUrl);

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
              source_url: item.sourceUrl,
              title: item.title,
              description: item.description,
              price_cents: item.priceCents,
              condition: item.condition,
              category_slug: item.categorySlug,
              city: item.city,
              state: item.state,
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

      const vanished = (priorItems ?? []).filter(
        (row: any) => row.status === "published" && !seenUrls.has(row.source_url),
      );
      for (const row of vanished) {
        const { error } = await admin
          .from("fb_marketplace_import_items")
          .update({ batch_id: batch.id, status: "possibly_removed" })
          .eq("source_profile_url", data.sourceProfileUrl)
          .eq("source_url", row.source_url);
        if (error) throw new Error(error.message);
      }

      return { batchId: batch.id, staged, updated, failed };
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
        "id,batch_id,source_profile_url,source_url,title,description,price_cents,condition,category_slug,city,state,region,public_paths,status,previous_price_cents,previous_description,listing_id,created_at",
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
        sourceUrl: row.source_url,
        title: row.title,
        description: row.description,
        priceCents: Number(row.price_cents),
        condition: row.condition,
        categorySlug: row.category_slug,
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
      .select("source_profile_url, status")
      .neq("status", "discarded");
    if (itemError) throw new Error(itemError.message);

    const counts = new Map<string, { open: number; published: number }>();
    for (const row of items ?? []) {
      const entry = counts.get(row.source_profile_url) ?? { open: 0, published: 0 };
      if (row.status === "published") entry.published += 1;
      else entry.open += 1;
      counts.set(row.source_profile_url, entry);
    }

    const profiles = new Map<string, FbImportProfile>();
    for (const batch of batches ?? []) {
      if (profiles.has(batch.source_profile_url)) continue;
      const entry = counts.get(batch.source_profile_url) ?? { open: 0, published: 0 };
      profiles.set(batch.source_profile_url, {
        sourceProfileUrl: batch.source_profile_url,
        sellerName: batch.seller_name,
        lastStagedAt: batch.created_at,
        openCount: entry.open,
        publishedCount: entry.published,
      });
    }
    return Array.from(profiles.values());
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

/**
 * Mints a real session for the seller's own account, the same way a "sign-in
 * link" email works, just completed in one step with the service role key's
 * admin privileges. No password is ever touched. This exists only so a
 * consenting seller's imported listings are created/updated/removed through
 * their own account and the exact same RPCs a real seller action uses --
 * never as a general "sign in as anyone" primitive.
 */
async function createActingAsSellerSession(admin: any, sellerId: string) {
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(sellerId);
  if (userError || !userResult?.user?.email) throw new Error("Seller account has no email.");
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResult.user.email,
  });
  if (linkError) throw new Error(`Could not start a session for the seller: ${linkError.message}`);
  const tokenHash = (linkData as any)?.properties?.hashed_token as string | undefined;
  if (!tokenHash) throw new Error("Could not generate a session token for the seller.");

  const actingClient = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: verifyError } = await actingClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError || !sessionData.session) {
    throw new Error(
      `Could not establish a seller session: ${verifyError?.message ?? "unknown error"}`,
    );
  }
  return actingClient as any;
}

export const publishFacebookImportItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { itemIds: string[]; sellerEmail: string; sellerDisplayName?: string | undefined }) => {
      const itemIds = (input.itemIds ?? []).map(String).filter(Boolean);
      const sellerEmail = String(input.sellerEmail ?? "")
        .trim()
        .toLowerCase();
      if (itemIds.length && (!sellerEmail || !sellerEmail.includes("@"))) {
        throw new Error("Enter the seller's email to publish under their account.");
      }
      return {
        itemIds,
        sellerEmail,
        sellerDisplayName: String(input.sellerDisplayName ?? "").trim(),
      };
    },
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ created: number; updated: number; removed: number; errors: number }> => {
      await requireAdmin(context);
      if (!data.itemIds.length) return { created: 0, updated: 0, removed: 0, errors: 0 };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const { data: items, error } = await admin
        .from("fb_marketplace_import_items")
        .select(
          "id,source_profile_url,title,description,price_cents,condition,category_slug,city,state,region,public_paths,evidence_paths,status,listing_id",
        )
        .in("id", data.itemIds);
      if (error) throw new Error(error.message);
      if (!items?.length) return { created: 0, updated: 0, removed: 0, errors: 0 };

      // One publish click is one seller: resolve/create their GemList account
      // once, then attribute every item in this call -- and every other
      // still-open item from the same Facebook profile, so a later re-stage
      // of that profile correctly diffs against this now-known seller
      // instead of treating everything as brand new again.
      const { data: batchInfo } = await admin
        .from("fb_marketplace_import_batches")
        .select("seller_name")
        .eq("source_profile_url", items[0].source_profile_url)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const displayName =
        data.sellerDisplayName ||
        batchInfo?.seller_name ||
        data.sellerEmail.split("@")[0] ||
        "Seller";
      const seller = await resolveImportSellerAccount(admin, data.sellerEmail, displayName);
      await admin
        .from("fb_marketplace_import_items")
        .update({ seller_id: seller.sellerId })
        .eq("source_profile_url", items[0].source_profile_url)
        .is("seller_id", null);
      const acting = await createActingAsSellerSession(admin, seller.sellerId);

      let created = 0;
      let updated = 0;
      let removed = 0;
      let errors = 0;

      for (const item of items) {
        try {
          if (item.status === "possibly_removed") {
            if (!item.listing_id) throw new Error("No linked listing to remove.");
            const { error: cancelError } = await acting.rpc("cancel_ask", {
              _ask_id: item.listing_id,
            });
            if (cancelError) throw new Error(cancelError.message);
            await admin
              .from("fb_marketplace_import_items")
              .update({ status: "published" })
              .eq("id", item.id);
            removed += 1;
            continue;
          }

          if (!item.city || !item.state || !item.region) {
            throw new Error("City, state, and region must be filled in before publishing.");
          }

          const { data: category, error: categoryError } = await admin
            .from("categories")
            .select("id")
            .eq("slug", item.category_slug)
            .maybeSingle();
          if (categoryError) throw new Error(categoryError.message);
          if (!category?.id) throw new Error(`Unknown category: ${item.category_slug}`);

          if (item.status === "needs_update") {
            if (!item.listing_id) throw new Error("No linked listing to update.");
            const { error: updateError } = await acting.rpc("update_classified_listing", {
              _listing_id: item.listing_id,
              _title: item.title,
              _description: item.description || item.title,
              _category_id: category.id,
              _price_cents: item.price_cents,
              _item_condition: item.condition || "used_good",
              _seller_note: null,
              _region: item.region,
              _city: item.city,
              _state: item.state,
              _postal_code: null,
              _fulfillment_mode: "local_pickup",
              _parcel_length_in: null,
              _parcel_width_in: null,
              _parcel_height_in: null,
              _parcel_weight_lb: null,
              _vehicle: {},
              _home: {},
              _job: {},
              _service: {},
              _pet: {},
            });
            if (updateError) throw new Error(updateError.message);
            await admin
              .from("fb_marketplace_import_items")
              .update({ status: "published" })
              .eq("id", item.id);
            updated += 1;
            continue;
          }

          const claimedPaths = await claimPhotosForSeller(
            admin,
            seller.sellerId,
            item.evidence_paths,
          );

          const { data: listingId, error: createError } = await acting.rpc(
            "create_classified_listing",
            {
              _title: item.title,
              _description: item.description || item.title,
              _category_id: category.id,
              _price_cents: item.price_cents,
              _item_condition: item.condition || "used_good",
              _seller_note: null,
              _region: item.region,
              _city: item.city,
              _state: item.state,
              _postal_code: null,
              _fulfillment_mode: "local_pickup",
              _parcel_length_in: null,
              _parcel_width_in: null,
              _parcel_height_in: null,
              _parcel_weight_lb: null,
              _evidence_paths: claimedPaths,
              _public_media_paths: claimedPaths,
              _vehicle: {},
              _home: {},
              _job: {},
              _service: {},
              _pet: {},
            },
          );
          if (createError) throw new Error(createError.message);
          await admin
            .from("fb_marketplace_import_items")
            .update({ status: "published", listing_id: listingId })
            .eq("id", item.id);
          created += 1;
        } catch {
          errors += 1;
        }
      }

      return { created, updated, removed, errors };
    },
  );

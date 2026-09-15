import { createClient } from "@supabase/supabase-js";
import { classifiedSeedListings } from "./classified-seed-data.mjs";

const apply = process.argv.includes("--apply");
const env = process.env;
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SEED_ACTOR_USER_ID"];

if (!apply) {
  console.log(
    `Dry run: ${classifiedSeedListings.length} fictional Idaho vehicle listings are ready.`,
  );
  for (const listing of classifiedSeedListings) {
    console.log(
      `- ${listing.title} · $${(listing.priceCents / 100).toLocaleString()} · ${listing.city}, ${listing.state}`,
    );
  }
  console.log(
    "\nRun with --apply, the Lovable Cloud service key, and a seed actor user ID to create pending listings.",
  );
  process.exit(0);
}

const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required seed configuration: ${missing.join(", ")}`);
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userData, error: userError } = await client.auth.admin.getUserById(
  env.SUPABASE_SEED_ACTOR_USER_ID,
);
if (userError || !userData.user) throw new Error(userError?.message ?? "Seed actor is invalid.");

const { data: categories, error: categoriesError } = await client
  .from("categories")
  .select("id,slug")
  .in("slug", [...new Set(classifiedSeedListings.map((listing) => listing.category))]);
if (categoriesError) throw new Error(categoriesError.message);
const categoryIds = new Map((categories ?? []).map((category) => [category.slug, category.id]));

const { data: existingProducts, error: existingError } = await client
  .from("products")
  .select("name")
  .eq("created_by", userData.user.id)
  .in(
    "name",
    classifiedSeedListings.map((listing) => listing.title),
  );
if (existingError) throw new Error(existingError.message);
const existingNames = new Set((existingProducts ?? []).map((product) => product.name));

function xml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function demoPhoto(listing) {
  const title = xml(listing.title);
  const location = xml(`${listing.city}, ${listing.state}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#eef1ee"/><rect x="40" y="40" width="1120" height="720" rx="24" fill="#d8e2dd" stroke="#183a35" stroke-width="8"/><path d="M210 520h780l-80-180H390z" fill="#f5f1e8" stroke="#183a35" stroke-width="10"/><circle cx="420" cy="540" r="66" fill="#183a35"/><circle cx="780" cy="540" r="66" fill="#183a35"/><text x="600" y="180" fill="#183a35" font-family="Arial,sans-serif" font-size="42" font-weight="700" text-anchor="middle">GEM STATE DEMO PHOTO</text><text x="600" y="650" fill="#183a35" font-family="Arial,sans-serif" font-size="30" text-anchor="middle">${title}</text><text x="600" y="700" fill="#183a35" font-family="Arial,sans-serif" font-size="24" text-anchor="middle">${location} · Replace before launch</text></svg>`;
}

for (const listing of classifiedSeedListings) {
  if (existingNames.has(listing.title)) {
    console.log(`Skipped existing listing: ${listing.title}`);
    continue;
  }
  const categoryId = categoryIds.get(listing.category);
  if (!categoryId) throw new Error(`Missing category in database: ${listing.category}`);
  const path = `${userData.user.id}/seed/${crypto.randomUUID()}.svg`;
  const body = new TextEncoder().encode(demoPhoto(listing));
  for (const bucket of ["ask-evidence", "listing-media"]) {
    const { error } = await client.storage.from(bucket).upload(path, body, {
      contentType: "image/svg+xml",
      upsert: false,
    });
    if (error) throw new Error(`${bucket} upload failed for ${listing.title}: ${error.message}`);
  }

  const { data: listingId, error } = await client.rpc("seed_classified_listing", {
    _owner_id: userData.user.id,
    _title: listing.title,
    _description: listing.description,
    _category_id: categoryId,
    _price_cents: listing.priceCents,
    _item_condition: listing.condition,
    _seller_note: "Seed record for MVP testing; replace demo photo and copy before approval.",
    _region: listing.region,
    _city: listing.city,
    _state: listing.state,
    _postal_code: listing.postalCode,
    _fulfillment_mode: listing.fulfillmentMode,
    _parcel_length_in: null,
    _parcel_width_in: null,
    _parcel_height_in: null,
    _parcel_weight_lb: null,
    _evidence_paths: [path],
    _public_media_paths: [path],
    _vehicle: listing.vehicle,
  });
  if (error) throw new Error(`Could not create ${listing.title}: ${error.message}`);
  const { error: counterError } = await client.rpc("sync_classified_media_counts", {
    _listing_id: listingId,
  });
  if (counterError)
    throw new Error(
      `Could not finalize media counts for ${listing.title}: ${counterError.message}`,
    );
  console.log(`Created pending listing ${listingId}: ${listing.title}`);
}

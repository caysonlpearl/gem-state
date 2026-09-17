import { createClient } from "@supabase/supabase-js";
import { classifiedSeedListings } from "./classified-seed-data.mjs";

const apply = process.argv.includes("--apply");
const env = process.env;
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SEED_ACTOR_USER_ID"];

if (!apply) {
  console.log(
    `Dry run: ${classifiedSeedListings.length} staged Idaho vehicle listings are ready.`,
  );
  for (const listing of classifiedSeedListings) {
    console.log(
      `- ${listing.title} · $${(listing.priceCents / 100).toLocaleString()} · ${listing.city}, ${listing.state}`,
    );
  }
  console.log(
    "\nRun with --apply, the Supabase service-role key, and a seed actor user ID to create pending listings.",
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

function illustrationPhoto() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4efe5"/><circle cx="980" cy="150" r="190" fill="#eadcc2"/><circle cx="170" cy="700" r="210" fill="#dce9e3"/><path d="M210 520h780l-80-180H390z" fill="#183a35"/><path d="M330 340h520l-55-86H420z" fill="#f3a542"/><circle cx="420" cy="540" r="66" fill="#102b43"/><circle cx="780" cy="540" r="66" fill="#102b43"/><circle cx="420" cy="540" r="27" fill="#e8c98e"/><circle cx="780" cy="540" r="27" fill="#e8c98e"/><path d="M490 385h220v80H490z" fill="#d9e7e2"/><path d="M520 405h55v35h-55zM625 405h55v35h-55z" fill="#7ba9a1"/></svg>`;
}

for (const listing of classifiedSeedListings) {
  if (existingNames.has(listing.title)) {
    console.log(`Skipped existing listing: ${listing.title}`);
    continue;
  }
  const categoryId = categoryIds.get(listing.category);
  if (!categoryId) throw new Error(`Missing category in database: ${listing.category}`);
  const path = `${userData.user.id}/seed/${crypto.randomUUID()}.svg`;
  const body = new TextEncoder().encode(illustrationPhoto());
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
    _seller_note: "Staged listing for marketplace testing. Confirm item details and availability directly with the seller.",
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

import { createClient } from "@supabase/supabase-js";
import { classifiedSeedListings } from "./classified-seed-data.mjs";

const apply = process.argv.includes("--apply");
const env = process.env;
const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SEED_ACCESS_TOKEN"];

if (!apply) {
  console.log(
    `Dry run: ${classifiedSeedListings.length} fictional Idaho vehicle listings are ready.`,
  );
  for (const listing of classifiedSeedListings) {
    console.log(
      `- ${listing.title} · $${(listing.priceCents / 100).toLocaleString()} · ${listing.city}, ${listing.state}`,
    );
  }
  console.log("\nRun with --apply and a real seller access token to create pending listings.");
  process.exit(0);
}

const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required seed configuration: ${missing.join(", ")}`);
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${env.SUPABASE_SEED_ACCESS_TOKEN}` } },
});

const { data: userData, error: userError } = await client.auth.getUser(
  env.SUPABASE_SEED_ACCESS_TOKEN,
);
if (userError || !userData.user)
  throw new Error(userError?.message ?? "Seed access token is invalid.");

const { data: seller, error: sellerError } = await client
  .from("seller_profiles")
  .select("status,terms_accepted_at,default_shipping_method,default_handling_days")
  .eq("user_id", userData.user.id)
  .maybeSingle();
if (sellerError) throw new Error(sellerError.message);
if (
  !seller ||
  seller.status !== "active" ||
  !seller.terms_accepted_at ||
  !seller.default_shipping_method ||
  !seller.default_handling_days
) {
  throw new Error("The seed account must have an active, verified seller profile first.");
}

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

  const { data: listingId, error } = await client.rpc("create_classified_listing", {
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
  console.log(`Created pending listing ${listingId}: ${listing.title}`);
}

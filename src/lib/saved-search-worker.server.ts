/* eslint-disable @typescript-eslint/no-explicit-any -- saved-search JSON supports category-specific filters */
import { emailSavedSearchMatch } from "./email-notifications.server";

type SavedSearchRow = {
  id: string;
  user_id: string;
  name: string;
  search: Record<string, unknown>;
  email_alerts: boolean;
  paused: boolean;
};

type ListingRow = {
  id: string;
  created_at: string;
  price_cents: number | null;
  products?: { name?: string; description?: string; categories?: { slug?: string } | null } | null;
  classified_listing_details?: Record<string, unknown> | null;
};

function text(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function priceCents(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return parsed > 100_000 ? Math.round(parsed) : Math.round(parsed * 100);
}

function matchesNumber(value: unknown, expected: unknown, direction: "min" | "max") {
  if (expected === undefined || expected === null || expected === "") return true;
  const actual = Number(value);
  const raw = String(expected).trim().toLowerCase();
  if (!raw || raw === "any" || raw === "any bedrooms" || raw === "any bathrooms") return true;
  const target = Number(raw.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
  if (raw.startsWith("<")) return actual < target;
  return direction === "min" ? actual >= target : actual <= target;
}

function matchesAnyText(value: unknown, expected: unknown) {
  const wanted = text(expected);
  if (!wanted) return true;
  const options = wanted.split(",").map((item) => item.trim()).filter(Boolean);
  return options.length === 0 || options.some((option) => text(value).includes(option));
}

function matches(search: Record<string, unknown>, listing: ListingRow) {
  const product = listing.products;
  const details = listing.classified_listing_details ?? {};
  const haystack = text(`${product?.name ?? ""} ${product?.description ?? ""}`);
  const query = text(search.q ?? search.query ?? search.keyword);
  if (query && !haystack.includes(query)) return false;

  const category = text(search.category ?? search.categorySlug ?? search.section);
  const listingCategory = text(product?.categories?.slug);
  if (category && category !== "all" && category !== listingCategory) return false;

  const location = text(search.city ?? search.region ?? search.state ?? search.location);
  const listingLocation = text(`${details.city ?? ""} ${details.region ?? ""} ${details.state ?? ""}`);
  if (location && !listingLocation.includes(location)) return false;

  const minimum = priceCents(search.priceMin ?? search.minPrice);
  const maximum = priceCents(search.priceMax ?? search.maxPrice);
  const listingPrice = Number(listing.price_cents ?? 0);
  if (minimum !== null && listingPrice < minimum) return false;
  if (maximum !== null && listingPrice > maximum) return false;

  if (!matchesAnyText(details.fulfillment_mode, search.fulfillment)) return false;
  if (!matchesAnyText(details.vehicle_make, search.make)) return false;
  if (!matchesAnyText(details.vehicle_model, search.model)) return false;
  if (!matchesNumber(details.vehicle_year, search.yearMin, "min")) return false;
  if (!matchesNumber(details.vehicle_year, search.yearMax, "max")) return false;
  if (!matchesNumber(details.vehicle_mileage, search.mileageMax, "max")) return false;
  if (!matchesAnyText(details.vehicle_body_style, search.bodyStyle)) return false;
  if (!matchesAnyText(details.vehicle_transmission, search.transmission)) return false;
  if (!matchesAnyText(details.vehicle_drivetrain, search.drivetrain)) return false;
  if (!matchesAnyText(details.vehicle_fuel_type, search.fuelType)) return false;
  if (!matchesAnyText(details.vehicle_exterior_color, search.exteriorColor)) return false;
  if (!matchesAnyText(details.vehicle_title_status, search.titleStatus)) return false;

  if (!matchesAnyText(details.home_mode, search.homeTab ?? search.homeMode)) return false;
  if (!matchesAnyText(details.home_property_type, search.propertyType)) return false;
  if (!matchesNumber(details.home_bedrooms, search.bedrooms, "min")) return false;
  if (!matchesNumber(details.home_bathrooms, search.bathrooms, "min")) return false;
  if (!matchesNumber(details.home_square_feet, search.homeSquareFeet, "min")) return false;
  if (!matchesAnyText(details.home_lease_length, search.leaseLength)) return false;
  if (!matchesAnyText(details.home_pets_policy, search.petsCats ?? search.petsDogs)) return false;

  if (!matchesAnyText(details.job_employment_type, search.jobType)) return false;
  if (!matchesAnyText(details.job_pay_type, search.jobPayType)) return false;
  if (!matchesNumber(details.job_pay_max, search.jobPayMin, "min")) return false;
  if (!matchesNumber(details.job_pay_min, search.jobPayMax, "max")) return false;
  if (!matchesAnyText(details.job_experience_required, search.jobExperience)) return false;
  if (!matchesAnyText(details.job_education_level, search.jobEducation)) return false;
  if (!matchesAnyText(haystack, search.jobCategory)) return false;

  if (!matchesAnyText(details.service_subcategory, search.serviceSubcategory)) return false;
  return true;
}

export async function processSavedSearchAlerts(listingId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const [searchesResult, listingsResult] = await Promise.all([
    admin.from("saved_searches").select("id,user_id,name,search,email_alerts,paused").eq("paused", false).limit(1000),
    admin.from("asks").select("id,created_at,price_cents,products!inner(name,description,categories(slug)),classified_listing_details(*)").eq("status", "active").not("approved_at", "is", null).gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).limit(500),
  ]);
  if (searchesResult.error) throw new Error(searchesResult.error.message);
  if (listingsResult.error) throw new Error(listingsResult.error.message);

  const listings = (listingsResult.data ?? []).filter((listing: ListingRow) => !listingId || listing.id === listingId) as ListingRow[];
  let matched = 0;
  let emailed = 0;
  for (const search of (searchesResult.data ?? []) as SavedSearchRow[]) {
    for (const listing of listings) {
      if (!matches(search.search ?? {}, listing)) continue;
      const { data: match, error: matchError } = await admin.from("saved_search_matches").upsert({ saved_search_id: search.id, listing_id: listing.id }, { onConflict: "saved_search_id,listing_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (matchError) throw new Error(matchError.message);
      if (!match?.id) continue;
      matched++;
      const itemName = listing.products?.name ?? "New marketplace listing";
      const listingPath = `/listings/${listing.id}`;
      await admin.from("notifications").insert({ user_id: search.user_id, kind: "saved_search_match", title: "New saved-search match", body: `${itemName} matches “${search.name}”.`, entity_type: "saved_search_match", entity_id: match.id, destination_url: listingPath });
      await admin.from("saved_searches").update({ last_match_at: new Date().toISOString() }).eq("id", search.id);
      if (search.email_alerts) {
        await emailSavedSearchMatch(search.user_id, { searchName: search.name, itemName, price: listing.price_cents == null ? undefined : `$${(Number(listing.price_cents) / 100).toFixed(2)}`, listingPath }, match.id);
        await admin.from("saved_search_matches").update({ emailed_at: new Date().toISOString() }).eq("id", match.id);
        emailed++;
      }
    }
  }
  return { listings: listings.length, matched, emailed };
}

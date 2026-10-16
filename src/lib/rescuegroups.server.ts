import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

import { serverEnv } from "./runtime-env.server";
import { isWithinClassifiedRadius } from "../config/classifieds.ts";
import { regionOfListing } from "./market-stats";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import {
  RESCUEGROUPS_API_BASE,
  RESCUEGROUPS_ID,
  normalizeRescueGroupsAnimals,
  rescueGroupsSearchBody,
  type RescueGroupsPet,
} from "./rescuegroups-contract";

/** The same Idaho areas as the homes feed, plus the central mountains, so
 * the 100-mile searches cover the whole state and its border areas. */
const CENTERS = [
  { key: "treasure-valley", postalCode: "83702" }, // Boise
  { key: "western-idaho", postalCode: "83647" }, // Mountain Home
  { key: "magic-valley", postalCode: "83301" }, // Twin Falls
  { key: "eastern-idaho", postalCode: "83402" }, // Idaho Falls
  { key: "southeast-idaho", postalCode: "83201" }, // Pocatello
  { key: "north-central-idaho", postalCode: "83501" }, // Lewiston
  { key: "north-idaho", postalCode: "83814" }, // Coeur d'Alene
  { key: "central-mountains", postalCode: "83638" }, // McCall
  { key: "salmon-river", postalCode: "83467" }, // Salmon
] as const;
const RADIUS_MILES = 100;
const PAGE_LIMIT = 100;
const MAX_PAGES = 3;
const REFRESH_MS = 12 * 60 * 60 * 1000;
const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|monitor|curl|wget|python/i;

function apiKey() {
  return serverEnv("RESCUEGROUPS_API_KEY");
}

function cacheDb() {
  const dbUrl = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
  const dbKey =
    serverEnv("GEM_STATE_SUPABASE_SERVICE_ROLE_KEY") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !dbKey) return null;
  return createClient(dbUrl, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        if (dbKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${dbKey}`)
          headers.delete("Authorization");
        headers.set("apikey", dbKey);
        return fetch(url, { ...init, headers });
      },
    },
  });
}

export function rescueGroupsConfigured() {
  return Boolean(apiKey());
}

/** Pets show in the Pets category (and all-items browsing). */
export function canIncludeRescueGroups(data: ClassifiedBrowseInput) {
  if (data.includeAllMocks || data.sellerSlug || data.dealerSlug) return false;
  if (data.group) return false;
  return !data.category || data.category === "pets";
}

/** One center's pets: cached, refreshed about twice a day, stale on failure. */
async function centerPets(center: (typeof CENTERS)[number]): Promise<RescueGroupsPet[]> {
  const db = cacheDb() as any;
  const key = apiKey();
  if (!db) return [];
  const cacheKey = `rescuegroups:v1:${center.key}`;
  const { data: cached } = await db
    .from("rescuegroups_cache")
    .select("payload,expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  const pets = (cached?.payload?.pets ?? []) as RescueGroupsPet[];
  const fresh = cached && Date.parse(cached.expires_at) > Date.now();
  // Crawlers and fresh caches never trigger provider calls.
  const fromBot = BOT.test(getRequest()?.headers.get("user-agent") ?? "");
  if (fresh || fromBot || !key) return pets;

  const { data: reservation } = await db.rpc("reserve_rescuegroups_call", {
    p_cache_key: cacheKey,
  });
  if (!reservation?.allowed) return pets;
  try {
    const all: RescueGroupsPet[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await fetch(
        `${RESCUEGROUPS_API_BASE}/animals/search/available/?include=pictures,orgs,species&limit=${PAGE_LIMIT}&page=${page}&sort=-animals.updatedDate`,
        {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/vnd.api+json" },
          body: JSON.stringify(rescueGroupsSearchBody(center.postalCode, RADIUS_MILES)),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok) break;
      const json = (await response.json()) as { meta?: { pages?: number } };
      all.push(...normalizeRescueGroupsAnimals(json));
      if (!json.meta?.pages || page >= json.meta.pages) break;
    }
    if (!all.length) return pets;
    await db.from("rescuegroups_cache").upsert({
      cache_key: cacheKey,
      payload: { pets: all },
      expires_at: new Date(Date.now() + REFRESH_MS).toISOString(),
      updated_at: new Date().toISOString(),
    });
    return all;
  } catch {
    // Provider errors must not expose request details or the API key.
    return pets;
  }
}

async function allPets() {
  const lists = await Promise.all(CENTERS.map((center) => centerPets(center)));
  return [...new Map(lists.flat().map((pet) => [pet.id, pet])).values()];
}

function feeCents(fee: string | null) {
  const match = String(fee ?? "")
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/);
  return match ? Math.round(Number(match[0]) * 100) : 0;
}

export function rescueGroupsCard(pet: RescueGroupsPet): ClassifiedCard {
  const city = pet.org?.city ?? "";
  const state = pet.org?.state ?? "";
  const species = pet.species ?? "Pet";
  return {
    id: `rescuegroups-${pet.id}`,
    productId: `rescuegroups-${pet.id}`,
    productSlug: "",
    title: pet.breed ? `${pet.name} · ${pet.breed}` : pet.name,
    priceCents: feeCents(pet.adoptionFee),
    currency: "USD",
    city,
    state,
    region: regionOfListing({ city, state }) ?? "",
    postalCode: pet.org?.postalCode ?? null,
    categorySlug: "pets",
    categoryName: "Pets",
    condition: "not_applicable",
    fulfillmentMode: "",
    createdAt: pet.updatedAt ?? new Date(0).toISOString(),
    isFeatured: false,
    imageUrl: pet.photos[0] ?? null,
    vehicle: null,
    pet: {
      subcategory: species,
      species,
      breed: pet.breed,
      name: pet.name,
      age: pet.ageGroup,
      sex: pet.sex,
      placementType: "adoption",
      offeredBy: "Rescue",
      hypoallergenic: null,
      vaccinated: null,
      spayedNeutered: null,
      microchipped: null,
      recordsAvailable: null,
      goodWithKids: null,
      goodWithDogs: null,
      goodWithCats: null,
      indoorOutdoor: null,
      specialNeeds: null,
      breedingTerms: null,
    },
    externalPet: {
      sourceUrl: pet.sourceUrl,
      orgName: pet.org?.name ?? null,
      orgPhone: pet.org?.phone ?? null,
      orgEmail: pet.org?.email ?? null,
      size: pet.size,
    },
  } as ClassifiedCard;
}

export async function rescueGroupsCards(data: ClassifiedBrowseInput): Promise<ClassifiedCard[]> {
  if (!canIncludeRescueGroups(data)) return [];
  const q = data.q?.trim().toLowerCase();
  return (await allPets())
    .filter(
      (pet) =>
        (!q ||
          `${pet.name} ${pet.breed ?? ""} ${pet.species ?? ""} ${pet.org?.city ?? ""}`
            .toLowerCase()
            .includes(q)) &&
        isWithinClassifiedRadius({
          city: data.city,
          listingCity: pet.org?.city ?? "",
          latitude: data.latitude,
          longitude: data.longitude,
          radiusMiles: data.radiusMiles,
        }),
    )
    .map(rescueGroupsCard);
}

export async function rescueGroupsDetail(listingId: string): Promise<ClassifiedDetail | null> {
  if (!RESCUEGROUPS_ID.test(listingId)) return null;
  const id = listingId.slice("rescuegroups-".length);
  const pet = (await allPets()).find((item) => item.id === id);
  if (!pet) return null;
  const card = rescueGroupsCard(pet);
  return {
    ...card,
    description: pet.description,
    postalCode: pet.org?.postalCode ?? null,
    expiresAt: null,
    sellerNote: null,
    variantId: listingId,
    seller: null,
    images: pet.photos.map((url) => ({ url, alt: pet.name })),
  };
}

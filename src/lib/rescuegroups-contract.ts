/**
 * RescueGroups.org (API v5) adoptable pets, normalized for Bluebird. Pure
 * functions only (no server imports) so they can be unit tested.
 *
 * Request shape (see docs/rescuegroups-handoff.md):
 *   POST https://api.rescuegroups.org/v5/public/animals/search/available/
 *        ?include=pictures,orgs,species&limit=100&page=1&sort=-animals.updatedDate
 *   Authorization: <RESCUEGROUPS_API_KEY>
 *   Content-Type: application/vnd.api+json
 *   body: { data: { filterRadius: { miles, postalcode } } }
 * The response is JSON:API: `data` animals plus `included` pictures/orgs/species.
 */

export const RESCUEGROUPS_ID = /^rescuegroups-[0-9]{1,20}$/;
export const RESCUEGROUPS_API_BASE = "https://api.rescuegroups.org/v5/public";

export type RescueGroupsPet = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  ageGroup: string | null;
  sex: string | null;
  size: string | null;
  description: string | null;
  adoptionFee: string | null;
  photos: string[];
  updatedAt: string | null;
  org: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    adoptionUrl: string | null;
  } | null;
  /** Where "Adopt" sends people: the org's adoption page or website. */
  sourceUrl: string | null;
};

type Resource = {
  type?: string;
  id?: string | number;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    {
      data?:
        { type?: string; id?: string | number }[] | { type?: string; id?: string | number } | null;
    }
  >;
};

const text = (value: unknown) => {
  const result =
    typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  return result || null;
};

const httpUrl = (value: unknown) => {
  const raw = text(value);
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const related = (resource: Resource, name: string) => {
  const data = resource.relationships?.[name]?.data;
  return (Array.isArray(data) ? data : data ? [data] : []).map((item) => String(item.id ?? ""));
};

/** Normalizes one search response page into pets. Unusable records are skipped. */
export function normalizeRescueGroupsAnimals(payload: unknown): RescueGroupsPet[] {
  const body = (payload ?? {}) as { data?: Resource[]; included?: Resource[] };
  const included = new Map<string, Resource>();
  for (const item of body.included ?? []) included.set(`${item.type}:${item.id}`, item);

  const pets: RescueGroupsPet[] = [];
  for (const animal of body.data ?? []) {
    const attrs = animal.attributes ?? {};
    const id = text(animal.id);
    const name = text(attrs.name);
    if (!id || !/^[0-9]+$/.test(id) || !name) continue;

    const photos = related(animal, "pictures")
      .map((pictureId) => included.get(`pictures:${pictureId}`))
      .filter(Boolean)
      .sort((a, b) => Number(a!.attributes?.order ?? 0) - Number(b!.attributes?.order ?? 0))
      .map((picture) => {
        const pa = picture!.attributes ?? {};
        const large = pa.large as { url?: string } | undefined;
        const original = pa.original as { url?: string } | undefined;
        return httpUrl(large?.url ?? original?.url);
      })
      .filter((url): url is string => Boolean(url));
    const thumbnail = httpUrl(attrs.pictureThumbnailUrl);
    if (!photos.length && thumbnail) photos.push(thumbnail);

    const orgResource = related(animal, "orgs")
      .map((orgId) => included.get(`orgs:${orgId}`))
      .find(Boolean);
    const oa = orgResource?.attributes ?? {};
    const org = orgResource
      ? {
          id: String(orgResource.id),
          name: text(oa.name),
          city: text(oa.city),
          state: text(oa.state)?.toUpperCase() ?? null,
          postalCode: text(oa.postalcode),
          phone: text(oa.phone),
          email: text(oa.email),
          website: httpUrl(oa.url),
          adoptionUrl: httpUrl(oa.adoptionUrl),
        }
      : null;

    const speciesResource = related(animal, "species")
      .map((speciesId) => included.get(`species:${speciesId}`))
      .find(Boolean);

    pets.push({
      id,
      name,
      species: text(speciesResource?.attributes?.singular),
      breed: text(attrs.breedString) ?? text(attrs.breedPrimary),
      ageGroup: text(attrs.ageGroup),
      sex: text(attrs.sexLabel),
      size: text(attrs.sizeGroup),
      description: text(attrs.descriptionText),
      adoptionFee: text(attrs.adoptionFeeString),
      photos: [...new Set(photos)].slice(0, 20),
      updatedAt: text(attrs.updatedDate),
      org,
      sourceUrl: org?.adoptionUrl ?? org?.website ?? null,
    });
  }
  return pets;
}

/** Search request body: available pets within `miles` of a postal code. */
export function rescueGroupsSearchBody(postalCode: string, miles: number) {
  return { data: { filterRadius: { miles, postalcode: postalCode } } };
}

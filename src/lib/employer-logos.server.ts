import { serverEnv } from "./runtime-env.server";
import { employerKey, logoImageUrl, pickLogoDomain } from "./employer-logo-match";
import type { ClassifiedCard } from "./classifieds.functions";
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";

/**
 * Employer logos for partner job cards, from logo.dev. Each employer name is
 * searched once and the answer (a domain, or none) is kept in
 * employer_logo_matches for 30 days, so a page of jobs costs at most a
 * handful of searches and usually none. Without logo.dev keys, or if a
 * lookup fails, cards keep the initials tile.
 */

const RECHECK_MS = 30 * 24 * 3600 * 1000;
const MAX_LOOKUPS_PER_REQUEST = 12;
const memo = new Map<string, { domain: string | null; at: number }>();

async function searchDomain(
  employer: string,
  secretKey: string,
): Promise<string | null | undefined> {
  try {
    const url = new URL("https://api.logo.dev/v2/search");
    url.search = new URLSearchParams({ q: employer, limit: "5" }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    // Rate limited or down: undefined means "ask again later", not "no logo".
    if (!response.ok) return undefined;
    const body = (await response.json()) as { data?: unknown };
    return pickLogoDomain(employer, Array.isArray(body.data) ? body.data : []);
  } catch {
    return undefined;
  }
}

export async function withEmployerLogos<T extends ClassifiedCard>(
  cards: T[],
  options: { cacheOnly?: boolean } = {},
): Promise<T[]> {
  const publishableKey = serverEnv("LOGO_DEV_PUBLISHABLE_KEY");
  const secretKey = serverEnv("LOGO_DEV_SECRET_KEY");
  if (!publishableKey || (!secretKey && !options.cacheOnly)) return cards;
  const names = new Map<string, string>();
  for (const card of cards) {
    const name = card.externalJob ? card.job?.employerName : null;
    const key = name ? employerKey(name) : "";
    if (key.length >= 3 && !names.has(key)) names.set(key, name!);
  }
  if (!names.size) return cards;

  const now = Date.now();
  const domains = new Map<string, string | null>();
  for (const key of names.keys()) {
    const hit = memo.get(key);
    if (hit && now - hit.at < RECHECK_MS) domains.set(key, hit.domain);
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = (supabaseAdmin as any).from("employer_logo_matches");
    const unknown = [...names.keys()].filter((key) => !domains.has(key));
    if (unknown.length) {
      const { data: rows } = await withCatalogReadDeadline<{
        data: { name_key: string; domain: string | null; checked_at: string }[] | null;
      }>(db.select("name_key, domain, checked_at").in("name_key", unknown));
      for (const row of (rows ?? []) as {
        name_key: string;
        domain: string | null;
        checked_at: string;
      }[]) {
        const at = Date.parse(row.checked_at);
        if (now - at >= RECHECK_MS) continue;
        domains.set(row.name_key, row.domain);
        memo.set(row.name_key, { domain: row.domain, at });
      }
    }
    const toSearch = [...names.keys()]
      .filter((key) => !options.cacheOnly && !domains.has(key))
      .slice(0, MAX_LOOKUPS_PER_REQUEST);
    const found = await Promise.all(
      toSearch.map(async (key) => [key, await searchDomain(names.get(key)!, secretKey)] as const),
    );
    const answered = found.filter(([, domain]) => domain !== undefined) as [
      string,
      string | null,
    ][];
    for (const [key, domain] of answered) {
      domains.set(key, domain);
      memo.set(key, { domain, at: now });
    }
    if (answered.length) {
      await db.upsert(
        answered.map(([name_key, domain]) => ({
          name_key,
          domain,
          checked_at: new Date(now).toISOString(),
        })),
        { onConflict: "name_key" },
      );
    }
  } catch {
    // Logos are decoration; never fail a job search over them.
  }

  return cards.map((card) => {
    const name = card.externalJob ? card.job?.employerName : null;
    const domain = name ? domains.get(employerKey(name)) : null;
    if (!domain || !card.externalJob) return card;
    return {
      ...card,
      externalJob: { ...card.externalJob, logoUrl: logoImageUrl(domain, publishableKey) },
    };
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- private migration-backed tables */
import {
  interests,
  rankShopping,
  shoppingEvent,
  SHOPPING_MODEL,
  SHOPPING_POLICY_VERSION,
  type ShoppingCard,
  type ShoppingEvent,
} from "./shopping-contract.ts";

export async function shoppingDb(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
export async function shoppingControls(db: any) {
  const { data, error } = await db.from("shopping_controls").select("*").eq("id", true).single();
  if (error) throw Error("Shopping personalization is temporarily unavailable.");
  return data;
}
export async function shoppingActor(request: Request, db: any) {
  const authorization = request.headers.get("authorization") ?? "";
  let user: any = null;
  if (authorization.startsWith("Bearer ")) {
    const result = await db.auth.getUser(authorization.slice(7));
    if (result.error) throw Error("Please sign in again.");
    user = result.data.user;
  }
  const match = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)__Host-bb_shopper=([0-9a-f-]{36})(?:;|$)/i);
  const guest = match?.[1] ?? crypto.randomUUID();
  return {
    user,
    subject: user ? `u:${user.id}` : `g:${guest}`,
    cookie: `__Host-bb_shopper=${guest}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000`,
  };
}
export function sameShoppingOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function shoppingActivity(db: any, subject: string): Promise<ShoppingEvent[]> {
  const { data, error } = await db
    .from("shopping_events")
    .select("id,kind,listing_id,session_id,search,context,occurred_at")
    .eq("subject", subject)
    .gte("occurred_at", new Date(Date.now() - 90 * 86400000).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(1500);
  if (error) throw Error("Shopping history could not be read.");
  const events: ShoppingEvent[] = (data ?? []).map((e: any) => ({
    id: e.id,
    kind: e.kind,
    listingId: e.listing_id,
    session: e.session_id,
    search: e.search,
    context: e.context,
    at: e.occurred_at,
  }));
  const favorites = await db
    .from("shopping_favorites")
    .select("listing_id,saved_at")
    .eq("subject", subject)
    .limit(500);
  if (favorites.error) throw Error("Saved interests could not be read.");
  for (const row of favorites.data ?? [])
    events.push({
      id: `favorite:${row.listing_id}`,
      kind: "save",
      listingId: row.listing_id,
      session: "favorite",
      at: row.saved_at,
    });
  if (subject.startsWith("u:")) {
    const saved = await db.rpc("shopping_saved_interests", { member_id: subject.slice(2) });
    if (saved.error) throw Error("Saved listings unavailable.");
    // Respect clear-history without deleting the shopper's explicit saved listings.
    const permission = await shoppingPermission(db, subject);
    for (const row of saved.data ?? [])
      if (Date.parse(row.saved_at) > Date.parse(permission?.history_after ?? "1970-01-01"))
        events.push({
          id: `existing:${row.listing_id}`,
          kind: "save",
          listingId: row.listing_id,
          session: "favorite",
          at: row.saved_at,
        });
  }
  return events;
}
export async function recordShoppingActivity(
  db: any,
  actor: Awaited<ReturnType<typeof shoppingActor>>,
  inputs: unknown[],
) {
  const controls = await shoppingControls(db);
  const permission = await shoppingPermission(db, actor.subject);
  if (!controls.tracking || !permission?.personalization) return { accepted: 0 };
  if (actor.user) {
    const role = await db.rpc("has_role", { _user_id: actor.user.id, _role: "admin" });
    if (role.error || role.data === true) return { accepted: 0 };
  }
  // One bounded batch per caller; refuse abnormal bursts rather than growing history indefinitely.
  const recent = await db
    .from("shopping_events")
    .select("id", { count: "exact", head: true })
    .eq("subject", actor.subject)
    .gte("occurred_at", new Date(Date.now() - 60000).toISOString());
  if (recent.error || recent.count > 200) return { accepted: 0 };
  const valid = inputs
    .slice(0, 50)
    .map((e) => shoppingEvent(e))
    .filter((e): e is ShoppingEvent => Boolean(e));
  const rows = valid.map((e) => ({
    id: e.id,
    subject: actor.subject,
    user_id: actor.user?.id ?? null,
    session_id: e.session,
    kind: e.kind,
    listing_id: e.listingId ?? null,
    search: e.search ?? {},
    context: e.context ?? {},
    occurred_at: e.at,
  }));
  if (!rows.length) return { accepted: 0 };
  const { data: inserted, error } = await db
    .from("shopping_events")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error) throw Error("Shopping activity could not be saved.");
  for (const e of valid.filter((e) => (inserted ?? []).some((r: any) => r.id === e.id))) {
    if (e.kind === "save")
      await db
        .from("shopping_favorites")
        .upsert(
          { subject: actor.subject, listing_id: e.listingId, saved_at: e.at },
          { onConflict: "subject,listing_id" },
        );
    if (e.kind === "unsave")
      await db
        .from("shopping_favorites")
        .delete()
        .eq("subject", actor.subject)
        .eq("listing_id", e.listingId);
  }
  return { accepted: inserted?.length ?? 0 };
}
export async function shoppingRecommendations(
  db: any,
  subject: string,
  options: { eligible?: (card: ShoppingCard) => boolean } = {},
) {
  const controls = await shoppingControls(db);
  const permission = await shoppingPermission(db, subject);
  if (!permission?.personalization || !controls.recommendations)
    return { recent: [], continuing: [], recommended: [], model: controls.model_version };
  const [allActivity, inventory, experiment] = await Promise.all([
    shoppingActivity(db, subject),
    db
      .from("shopping_inventory")
      .select("card,content_hash")
      .gt("valid_until", new Date().toISOString())
      .order("first_seen_at", { ascending: false })
      .limit(200),
    shoppingHoldout(db, subject),
  ]);
  if (inventory.error) throw Error("Recommendations could not be loaded.");
  const holdout = experiment;
  let activity = allActivity;
  if (options.eligible) {
    // Store clients cannot learn from or seed recommendations with restricted
    // website inventory. Resolve references from our own projection only.
    const ids = [...new Set(allActivity.flatMap((e) => (e.listingId ? [e.listingId] : [])))];
    const permitted = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 200) {
      const rows = await db
        .from("shopping_inventory")
        .select("listing_id,card")
        .in("listing_id", ids.slice(offset, offset + 200));
      if (rows.error) throw Error("Recommendation references unavailable.");
      for (const row of rows.data ?? [])
        if (options.eligible(row.card)) permitted.add(row.listing_id);
    }
    activity = allActivity.filter((e) =>
      e.listingId
        ? permitted.has(e.listingId)
        : !e.search?.category ||
          options.eligible!({
            id: "search",
            title: "",
            categorySlug: String(e.search.category),
            priceCents: 0,
            createdAt: "",
          }),
    );
  }
  const profile = interests(activity),
    seedIds = [...profile.values()]
      .filter((i) => !i.dismissed)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((i) => i.listingId);
  const [references, visualRows] = await Promise.all([
    seedIds.length
      ? db
          .from("shopping_inventory")
          .select("card,content_hash,valid_until")
          .in("listing_id", seedIds)
      : { data: [] },
    seedIds.length && !holdout
      ? db.rpc("shopping_visual_candidates", { seed_ids: seedIds })
      : { data: [] },
  ]);
  if (references.error || visualRows.error) throw Error("Recommendation candidates unavailable.");
  const current = new Map<string, ShoppingCard>(
    [
      ...(inventory.data ?? []),
      ...(references.data ?? []).filter((r: any) => Date.parse(r.valid_until) > Date.now()),
      ...(visualRows.data ?? []),
    ]
      .filter((r: any) => !options.eligible || options.eligible(r.card))
      .map((r: any) => [r.card.id, r.card]),
  );
  // SQL eligibility applies to vector candidates. Native references receive the same current-state gate.
  const nativeIds = [...current.keys()].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (nativeIds.length) {
    const live = await db
      .from("asks")
      .select("id,products!inner(status)")
      .in("id", nativeIds)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published");
    if (live.error) throw Error("Listing eligibility unavailable.");
    const ids = new Set(live.data.map((r: any) => r.id));
    for (const id of nativeIds) if (!ids.has(id)) current.delete(id);
  }
  const cards = [
    ...new Map(
      [
        ...current.values(),
        ...(references.data ?? [])
          .filter((r: any) => !options.eligible || options.eligible(r.card))
          .map((r: any) => r.card as ShoppingCard),
      ].map((c) => [c.id, c]),
    ).values(),
  ];
  const recent = [...profile.values()]
    .filter((x) => !x.dismissed && !x.purchased && x.lastAt)
    .sort((a, b) => b.lastAt - a.lastAt)
    .flatMap((x) => (current.has(x.listingId) ? [current.get(x.listingId)!] : []))
    .slice(0, 8);
  const continuing = [...profile.values()]
    .filter((x) => !x.dismissed && !x.purchased && (x.favorite || x.recentSessions.size >= 2))
    .sort((a, b) => b.score - a.score)
    .flatMap((x) => (current.has(x.listingId) ? [current.get(x.listingId)!] : []))
    .slice(0, 8);
  const similarities = new Map<string, number>(
    (visualRows.data ?? []).map((r: any) => [`${r.seed_id}:${r.listing_id}`, r.similarity]),
  );
  const ranked = holdout
    ? []
    : rankShopping(
        cards,
        activity,
        new Map(),
        Date.now(),
        controls.model?.weights,
        similarities,
      ).filter(
        (r) => current.has(r.card.id) && r.score > 1 && !recent.some((c) => c.id === r.card.id),
      );
  const counts = new Map<string, number>(),
    recommended: ShoppingCard[] = [];
  for (const row of ranked) {
    const key = String(row.card.discoverySellerKey ?? row.card.id);
    if ((counts.get(key) ?? 0) >= 2) continue;
    recommended.push({ ...row.card, shoppingFeatures: row.features });
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (recommended.length === 8) break;
  }
  return { recent, continuing, recommended, model: controls.model_version, holdout };
}
export async function updateShoppingConsent(
  db: any,
  actor: Awaited<ReturnType<typeof shoppingActor>>,
  input: any,
) {
  if (!actor.user) throw Error("Please sign in to update account preferences.");
  const { error } = await db.rpc("set_shopping_account", {
    member_id: actor.user.id,
    accept_terms: input.acceptTerms === true,
    alerts: typeof input.shoppingAlerts === "boolean" ? input.shoppingAlerts : null,
    policy: SHOPPING_POLICY_VERSION,
  });
  if (error) throw Error("Your preferences could not be saved.");
  return { ok: true };
}
export async function shoppingPermission(db: any, subject: string) {
  const r = await db
    .from("shopping_privacy")
    .select("personalization,advertising,history_after")
    .eq("subject", subject)
    .maybeSingle();
  if (r.error) throw Error("Privacy preferences unavailable.");
  return r.data;
}
export async function shoppingHoldout(db: any, subject: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject)),
  );
  const holdout = bytes[0] % 10 === 0;
  const r = await db
    .from("shopping_experiments")
    .upsert({ subject, holdout }, { onConflict: "subject", ignoreDuplicates: true });
  if (r.error) throw Error("Comparison assignment unavailable.");
  return holdout;
}
export async function handleShoppingRequest(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie, Authorization",
    "Content-Type": "application/json",
  });
  if (request.method !== "GET" && !sameShoppingOrigin(request))
    return new Response("Forbidden", { status: 403, headers });
  try {
    const db = await shoppingDb(),
      actor = await shoppingActor(request, db);
    const action = new URL(request.url).searchParams.get("action") ?? "status";
    if (request.method === "GET") {
      if (action === "similar") {
        if (!(await shoppingControls(db)).recommendations)
          return Response.json({ cards: [] }, { headers });
        const id = new URL(request.url).searchParams.get("listing") ?? "";
        if (!/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(id))
          return Response.json({ cards: [] }, { headers });
        const r = await db.rpc("shopping_visual_candidates", { seed_ids: [id] });
        if (r.error) throw Error("Similar listings unavailable.");
        return Response.json(
          {
            cards: (r.data ?? [])
              .filter((r: any) => r.listing_id !== id)
              .slice(0, 8)
              .map((r: any) => r.card),
            model: SHOPPING_MODEL,
          },
          { headers },
        );
      }
      if (action === "recommendations")
        return Response.json(await shoppingRecommendations(db, actor.subject), { headers });
      const account = actor.user
        ? await db
            .from("shopping_accounts")
            .select("terms_version,shopping_alerts")
            .eq("user_id", actor.user.id)
            .maybeSingle()
        : { data: null };
      return Response.json(
        {
          account: account.data,
          signedIn: Boolean(actor.user),
          privacy: await shoppingPermission(db, actor.subject),
          advertising: (await shoppingControls(db)).advertising
            ? (await import("./shopping-advertising.server")).shoppingAdvertisingConfig()
            : {},
          version: SHOPPING_POLICY_VERSION,
        },
        { headers },
      );
    }
    if (Number(request.headers.get("content-length") ?? 0) > 64000)
      return new Response("Too large", { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 64000) return new Response("Too large", { status: 413, headers });
    const body = JSON.parse(raw);
    if (Array.isArray(body.events))
      for (const event of body.events) {
        event.context = {
          ...event.context,
          country: (request as any).cf?.country,
          region: (request as any).cf?.regionCode,
        };
      }
    if (action === "consent")
      return Response.json(await updateShoppingConsent(db, actor, body), { headers });
    if (action === "clear") {
      const { error } = await db.rpc("clear_shopping_history", { subject_key: actor.subject });
      if (error) throw Error("History could not be cleared.");
      return Response.json({ ok: true }, { headers });
    }
    if (action === "privacy") {
      const result = await db.rpc("set_shopping_privacy", {
        subject_key: actor.subject,
        member_id: actor.user?.id ?? null,
        personalize: body.personalization === true,
        advertise: body.advertising === true && request.headers.get("sec-gpc") !== "1",
        policy: SHOPPING_POLICY_VERSION,
      });
      if (result.error) throw Error("Privacy choices could not be saved.");
      headers.append("Set-Cookie", actor.cookie);
      return Response.json({ ok: true }, { headers });
    }
    await (
      await import("./shopping-advertising.server")
    ).queueShoppingAdvertising(db, actor, Array.isArray(body.events) ? body.events : [], request);
    if (body.personalization !== true) return Response.json({ accepted: 0 }, { headers });
    headers.append("Set-Cookie", actor.cookie);
    return Response.json(
      await recordShoppingActivity(db, actor, Array.isArray(body.events) ? body.events : []),
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Shopping is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
export async function queueShopping(db: any, row: any) {
  const { error } = await db
    .from("shopping_queue")
    .upsert(row, { onConflict: "user_id,listing_id,event_key", ignoreDuplicates: true });
  if (error) throw Error("Shopping alert could not be queued.");
}
export async function syncShoppingInventory(db: any) {
  const { readHomepageSnapshot } = await import("./homepage-snapshot.server");
  const { HOME_MAX_STALE_MS } = await import("./homepage-snapshot-contract");
  const snapshot = await (
      await import("./homepage-snapshot-build.server")
    ).buildHomepageSnapshot(await readHomepageSnapshot(), undefined, true),
    now = Date.now();
  const expiry = new Map<string, number>();
  const cards = new Map<string, ShoppingCard>();
  const failedSources = Object.keys(snapshot.sourceFailures ?? {});
  for (const [source, section] of Object.entries(snapshot.sections)) {
    if (failedSources.includes(source)) continue;
    if (!section || now - section.updatedAt > HOME_MAX_STALE_MS) continue;
    for (const card of section.cards) {
      cards.set(card.id, card as unknown as ShoppingCard);
      expiry.set(
        card.id,
        Math.min(
          section.updatedAt + HOME_MAX_STALE_MS,
          card.externalHome?.cacheExpiresAt
            ? Date.parse(card.externalHome.cacheExpiresAt)
            : Infinity,
        ),
      );
    }
  }
  const oldRows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db
      .from("shopping_inventory")
      .select("listing_id,price_cents,content_hash")
      .order("listing_id")
      .range(offset, offset + 999);
    if (page.error) throw Error("Inventory history unavailable.");
    oldRows.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const prior = new Map(oldRows.map((r) => [r.listing_id, r]));
  // Missing candidates lose recommendation eligibility; disappearance is never a sale.
  const absent = failedSources.length
    ? []
    : oldRows.filter((r) => !cards.has(r.listing_id)).map((r) => r.listing_id);
  for (let i = 0; i < absent.length; i += 200) {
    const r = await db
      .from("shopping_inventory")
      .update({ valid_until: new Date(now).toISOString() })
      .in("listing_id", absent.slice(i, i + 200));
    if (r.error) throw Error("Inventory expiry could not be saved.");
  }
  const updates = await Promise.all(
    [...cards.values()].map(async (card) => {
      const old = prior.get(card.id),
        priceChanged = old && old.price_cents !== card.priceCents;
      const hash = await contentHash(
        `${card.title}|${JSON.stringify(card.vehicle ?? card.home ?? {})}|${(card.imageUrl ?? "").split("?")[0]}`,
      );
      const row: any = {
        listing_id: card.id,
        card,
        category: card.categorySlug,
        price_cents: card.priceCents,
        content_hash: hash,
        last_seen_at: new Date(now).toISOString(),
        valid_until: new Date(expiry.get(card.id)!).toISOString(),
      };
      if (priceChanged) {
        row.previous_price_cents = old.price_cents;
        row.price_version = crypto.randomUUID();
        row.price_changed_at = new Date(now).toISOString();
      }
      return row;
    }),
  );
  // Separate changed-price updates: omitted price history must remain intact.
  for (const changed of [false, true]) {
    const pool = updates.filter((r) => Boolean(r.price_version) === changed);
    for (let offset = 0; offset < pool.length; offset += 200) {
      const result = await db
        .from("shopping_inventory")
        .upsert(pool.slice(offset, offset + 200), { onConflict: "listing_id" });
      if (result.error) throw Error("Inventory projection could not be saved.");
    }
  }
  const controls = await shoppingControls(db);
  const saved = await db
    .from("shopping_controls")
    .update({
      model: {
        ...controls.model,
        catalogStatus: {
          at: new Date().toISOString(),
          sourceFailures: failedSources,
          observed: cards.size,
          elapsedMs: Date.now() - now,
        },
      },
    })
    .eq("id", true);
  if (saved.error) throw Error("Catalog status unavailable.");
  if (!failedSources.length)
    await db
      .from("shopping_controls")
      .update({ catalog_ready_at: new Date().toISOString() })
      .eq("id", true)
      .is("catalog_ready_at", null);
  return cards.size;
}
export async function contentHash(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/* eslint-disable @typescript-eslint/no-explicit-any -- private shared tables and domain actor. */
import { MobileApiError, mobileJson } from "./mobile-api";
import { MOBILE_POLICY_VERSION, mobileListingAllowed, mobileCategories } from "./mobile-contract";
import {
  mobileGuestSubject,
  mobileShoppingEvent,
  mobileRecommendationVehicle,
} from "./mobile-shopping";
import { mobileShoppingConsent } from "./mobile-shopping-consent";
import {
  shoppingPermission,
  shoppingControls,
  shoppingRecommendations,
  shoppingExternalEligibility,
  recordShoppingActivity,
} from "./shopping.server";

/** Only uses shared/private cached inventory, never a listing-provider request. */
export async function handleMobileShopping(
  request: Request,
  path: string,
  db: any,
  user: any | null,
) {
  const subject = user
    ? `u:${user.id}`
    : mobileGuestSubject(request.headers.get("X-Bluebird-Install"));
  if (!subject)
    throw new MobileApiError(400, "install_required", "Please reopen Bluebird and try again.");
  if (user) {
    const deletion = await db
      .from("mobile_account_deletions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (deletion.error) throw Error("Account controls unavailable.");
    if (deletion.data)
      throw new MobileApiError(409, "deletion_pending", "Your account deletion is pending.");
  }
  async function acceptedTerms() {
    if (!user) return true;
    const result = await db
      .from("shopping_accounts")
      .select("terms_version,mobile_terms_version,mobile_terms_accepted_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (result.error)
      throw new MobileApiError(
        503,
        "consent_unavailable",
        "Account preferences are temporarily unavailable.",
      );
    return mobileShoppingConsent(result.data).terms_version === MOBILE_POLICY_VERSION;
  }
  async function requireAcceptance() {
    if (!(await acceptedTerms()))
      throw new MobileApiError(
        409,
        "terms_required",
        "Please accept the current Terms of Service first.",
      );
  }
  if (request.method === "GET" && path === "shopping") {
    const permission = await shoppingPermission(db, subject),
      controls = await shoppingControls(db);
    return {
      personalization: permission?.personalization === true && (await acceptedTerms()),
      trackingAvailable: controls.tracking === true,
      recommendationsAvailable: controls.recommendations === true,
      version: MOBILE_POLICY_VERSION,
      historyAfter: permission?.history_after ?? null,
    };
  }
  if (request.method === "GET" && path === "recommendations") {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== null && scope !== "vehicles")
      throw new MobileApiError(400, "invalid_scope", "Choose a recommendation category.");
    if (!(await acceptedTerms()))
      return { recent: [], continuing: [], recommended: [], model: "rules-v1" };
    return shoppingRecommendations(db, subject, {
      categories: mobileCategories
        .map((category) => category.slug)
        .filter((categorySlug) =>
          scope === "vehicles"
            ? mobileRecommendationVehicle({ categorySlug })
            : categorySlug !== "jobs" && categorySlug !== "services",
        ),
      eligible:
        scope === "vehicles"
          ? (card) => mobileListingAllowed(card) && mobileRecommendationVehicle(card)
          : (card) =>
              mobileListingAllowed(card) &&
              card.categorySlug !== "jobs" &&
              card.categorySlug !== "services",
    });
  }
  if (request.method === "GET" && path === "similar") {
    const id = new URL(request.url).searchParams.get("listingId");
    if (!id || !/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(id))
      throw new MobileApiError(400, "invalid_listing", "Choose a listing.");
    if (!(await shoppingControls(db)).recommendations) return { cards: [], model: "rules-v1" };
    const seed = await db
      .from("shopping_inventory")
      .select("card")
      .eq("listing_id", id)
      .gt("valid_until", new Date().toISOString())
      .maybeSingle();
    if (seed.error) throw Error("Similar listings unavailable.");
    if (!seed.data || !mobileListingAllowed(seed.data.card))
      return { cards: [], model: "rules-v1" };
    const result = await db.rpc("shopping_visual_candidates", { seed_ids: [id] });
    if (result.error) throw Error("Similar listings unavailable.");
    const allowed = await shoppingExternalEligibility(db, [
      id,
      ...(result.data ?? []).map((r: any) => r.listing_id),
    ]);
    if (!allowed.has(id)) return { cards: [], model: "rules-v1" };
    return {
      cards: (result.data ?? [])
        .map((r: any) => r.card)
        .filter((c: any) => c.id !== id && allowed.has(c.id) && mobileListingAllowed(c))
        .slice(0, 8),
      model: "siglip2-base-patch16-224-v1",
    };
  }
  const body = await mobileJson(request);
  if (request.method === "PUT" && path === "shopping/privacy") {
    if (typeof body.personalization !== "boolean")
      throw new MobileApiError(400, "invalid_choice", "Choose whether to personalize shopping.");
    if (body.personalization) await requireAcceptance();
    const result = await db.rpc("mobile_set_personalization", {
      _subject: subject,
      _user: user?.id ?? null,
      _allowed: body.personalization,
    });
    if (result.error) throw Error("Privacy choices unavailable.");
    return { personalization: body.personalization };
  }
  if (request.method === "POST" && path === "shopping/clear") {
    const result = await db.rpc("mobile_clear_shopping_history", {
      _subject: subject,
      _user: user?.id ?? null,
    });
    if (result.error) throw Error("Shopping history unavailable.");
    return { cleared: true };
  }
  if (request.method === "POST" && path === "activity") {
    await requireAcceptance();
    if (!Array.isArray(body.events) || body.events.length > 50)
      throw new MobileApiError(400, "invalid_events", "Send a smaller activity batch.");
    const events = body.events.map(mobileShoppingEvent).filter(Boolean);
    const ids = [...new Set(events.flatMap((e: any) => (e.listingId ? [e.listingId] : [])))];
    const permitted = new Set<string>();
    if (ids.length) {
      const rows = await db
        .from("shopping_inventory")
        .select("listing_id,card")
        .in("listing_id", ids)
        .gt("valid_until", new Date().toISOString());
      if (rows.error) throw Error("Shopping references unavailable.");
      for (const row of rows.data ?? [])
        if (mobileListingAllowed(row.card)) permitted.add(row.listing_id);
    }
    return recordShoppingActivity(
      db,
      { user, subject, cookie: "" },
      events.filter((e: any) => !e.listingId || permitted.has(e.listingId)),
    );
  }
  throw new MobileApiError(404, "not_found", "This app action was not found.");
}

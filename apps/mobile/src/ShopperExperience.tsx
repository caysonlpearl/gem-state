import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ListingRowView,
  ListingCardView,
  type ListingCardLinkProps,
} from "../../../src/components/classifieds/ListingCardView";
import { listingPresentation } from "./listing-presentation";
import { ListingSourceCredits } from "./ListingSourceCredits";
import { mobileRecommendationVehicle } from "../../../src/lib/mobile-shopping";
import { MarketplaceListingSection } from "../../../src/components/classifieds/MarketplaceListingSection";
import { mobileSaleItem, mixMobileSaleFeed } from "../../../src/lib/mobile-sale-feed";
import { CardSaveButton } from "./SavedCards";
import { mobileListingAllowed, type MobileListing } from "../../../src/lib/mobile-contract";
import { api, apiOrigin } from "./client";
import { isShoppingForeground, shoppingOverlayOpen } from "./shopping-activity";
import {
  applyShopperStatus,
  clearShoppingHistory,
  flushShopping,
  shopperStatus,
  trackShopping,
  updatePersonalization,
  shoppingActor,
  recommendationScope,
  cachedRecommendations,
  cacheRecommendations,
  type ShopperStatus,
  type RecommendationRows,
} from "./shopping";

const OpenListing = createContext<(id: string) => void>(() => {});
function NativeListingLink({ listing, className, children, ariaLabel }: ListingCardLinkProps) {
  const open = useContext(OpenListing);
  return (
    <a
      href={`#/listings/${encodeURIComponent(listing.id)}`}
      className={`${className} text-inherit`}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.preventDefault();
        open(listing.id);
      }}
    >
      {children}
    </a>
  );
}
export function ListingTile({
  card,
  position,
  placement = "browse",
  model = "browse-v1",
  learning,
  onOpen,
  view = "grid",
  density = "standard",
}: {
  view?: "grid" | "list";
  density?: "standard" | "compact" | "browse";
  card: MobileListing;
  position: number;
  placement?: string;
  model?: string;
  learning: boolean;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const recommendation =
    placement !== "browse" && placement !== "saved" && !placement.startsWith("home:");
  useEffect(() => {
    if (!learning || !ref.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      intersecting = false;
    const assess = () => {
      if (timer) clearTimeout(timer);
      if (
        !intersecting ||
        !isShoppingForeground() ||
        document.visibilityState !== "visible" ||
        shoppingOverlayOpen()
      )
        return;
      timer = setTimeout(() => {
        if (
          intersecting &&
          isShoppingForeground() &&
          document.visibilityState === "visible" &&
          !shoppingOverlayOpen()
        )
          trackShopping("impression", card.id, {
            position,
            placement,
            model,
            source: recommendation ? "recommendation" : "browse",
            ...card.shoppingFeatures,
          });
      }, 1000);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting === true && entry.intersectionRatio >= 0.5;
        assess();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(ref.current);
    document.addEventListener("focusin", assess);
    document.addEventListener("visibilitychange", assess);
    document.addEventListener("bluebird-visibility-change", assess);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      document.removeEventListener("focusin", assess);
      document.removeEventListener("visibilitychange", assess);
      document.removeEventListener("bluebird-visibility-change", assess);
    };
  }, [card.id, card.shoppingFeatures, learning, model, placement, position, recommendation]);
  const open = (id: string) => {
    if (recommendation)
      trackShopping("recommendation_click", id, {
        position,
        placement,
        model,
        source: "recommendation",
        ...card.shoppingFeatures,
      });
    onOpen(id);
  };
  const View = view === "list" ? ListingRowView : ListingCardView;
  return (
    <OpenListing.Provider value={open}>
      <View
        {...(view === "grid" ? { density } : {})}
        className="listing-card"
        listing={listingPresentation(card)}
        elementRef={ref}
        renderLink={NativeListingLink}
        saveAction={<CardSaveButton card={card} />}
      />
    </OpenListing.Provider>
  );
}
export function ShoppingRows({
  learning,
  onOpen,
  revision,
  similarId,
  fallbackCards = [],
  active = true,
  onPersonalize,
  sourceCreditsCovered = {},
}: {
  learning: boolean;
  onOpen: (id: string) => void;
  revision: number;
  similarId?: string;
  fallbackCards?: MobileListing[];
  active?: boolean;
  onPersonalize?: () => void;
  sourceCreditsCovered?: { pets?: boolean; vehicles?: boolean };
}) {
  const identityScope = recommendationScope();
  const scope = `${identityScope}:${similarId ?? ""}`;
  const [loaded, setRows] = useState<{ scope: string; rows: RecommendationRows } | null>(null);
  useEffect(() => {
    if (!active) return;
    if (!learning && !similarId) {
      setRows(null);
      return;
    }
    const controller = new AbortController();
    const actor = shoppingActor();
    const load = similarId
      ? api<{ cards: MobileListing[]; model: string }>(
          `similar?listingId=${encodeURIComponent(similarId)}`,
          "GET",
          undefined,
          controller.signal,
          actor,
        ).then((r) => ({ recent: [], continuing: [], recommended: r.cards, model: r.model }))
      : flushShopping().then(() => {
          controller.signal.throwIfAborted();
          return api<RecommendationRows>(
            "recommendations",
            "GET",
            undefined,
            controller.signal,
            actor,
          );
        });
    load
      .then((rows) => {
        if (controller.signal.aborted) return;
        setRows({ scope, rows });
        if (!similarId) cacheRecommendations(identityScope, rows);
        if (!similarId) {
          void api<RecommendationRows>(
            "recommendations?scope=vehicles",
            "GET",
            undefined,
            controller.signal,
            actor,
          )
            .then((vehicles) => {
              if (!controller.signal.aborted) {
                const combined = {
                  ...rows,
                  vehicles: vehicles.recommended.filter(mobileRecommendationVehicle),
                };
                cacheRecommendations(identityScope, combined);
                setRows({
                  scope,
                  rows: combined,
                });
              }
            })
            .catch(() => {
              /* General recommendations remain available. */
            });
        }
      })
      .catch(() => {
        /* Browsing remains the useful fallback. */
      });
    return () => controller.abort();
  }, [active, learning, revision, similarId, scope, identityScope]);
  const byId = new Map(fallbackCards.map((card) => [card.id, card]));
  const fallback = mixMobileSaleFeed(fallbackCards.map(listingPresentation), [], 8).map((card) =>
    byId.get(card.id)!,
  );
  const rows =
    learning || similarId
      ? loaded?.scope === scope
        ? loaded.rows
        : !similarId && learning
          ? cachedRecommendations()
          : null
      : null;
  if (similarId && !rows) return null;
  const current = rows ?? { recent: [], continuing: [], recommended: [], model: "category-mix-v1" };
  const recommended = current.recommended.filter(mobileSaleItem);
  const vehicles = current.vehicles?.filter(mobileRecommendationVehicle) ?? [];
  const vehicleFallback = fallbackCards
    .filter((card) => mobileListingAllowed(card) && mobileRecommendationVehicle(card))
    .slice(0, 8);
  const groups: [string, string, MobileListing[]][] = similarId
    ? [["More like this", "similar", current.recommended]]
    : [
        [
          "For you",
          recommended.length ? "recommended" : "home:for-you-fallback",
          recommended.length ? recommended : fallback,
        ],
        [
          "Vehicles we think you'll like",
          vehicles.length ? "recommended:vehicles" : "home:vehicles-fallback",
          vehicles.length ? vehicles : vehicleFallback,
        ],
        ["Recently viewed", "recent", current.recent],
        ["Continue shopping", "continuing", current.continuing],
      ];
  return (
    <div className="native-recommendations recommendations">
      {groups.map(([label, placement, allItems]) => {
        const items = allItems.filter(similarId ? mobileListingAllowed : mobileSaleItem);
        return items.length ? (
          <MarketplaceListingSection
            key={placement}
            className="native-home-section"
            density="compact"
            eyebrow=""
            title={label}
            action={
              ["home:for-you-fallback", "home:vehicles-fallback"].includes(placement) &&
              !learning &&
              onPersonalize ? (
                <button
                  onClick={onPersonalize}
                  className="min-h-11 text-[12.5px] font-semibold text-primary"
                >
                  Personalize
                </button>
              ) : null
            }
          >
            <div className="native-listing-rail no-scrollbar mt-2 flex gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {items.map((card, position) => (
                <div className="native-rail-card min-w-0 shrink-0" key={card.id}>
                  <ListingTile
                    density="compact"
                    card={card}
                    position={position}
                    placement={placement}
                    model={placement.startsWith("home:") ? "category-mix-v1" : current.model}
                    learning={learning}
                    onOpen={onOpen}
                  />
                </div>
              ))}
            </div>
            {similarId && (
              <ListingSourceCredits
                cards={items.filter(
                  (card) =>
                    !(sourceCreditsCovered.pets && card.id.startsWith("rescuegroups-")) &&
                    !(sourceCreditsCovered.vehicles && card.id.startsWith("marketcheck-")),
                )}
              />
            )}
          </MarketplaceListingSection>
        ) : null;
      })}
    </div>
  );
}

export function PrivacyChoices({
  open,
  onClose,
  status,
  onStatus,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  status: ShopperStatus | null;
  onStatus: (status: ShopperStatus) => void;
  userId: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
    document.dispatchEvent(new Event("bluebird-visibility-change"));
  }, [open]);
  const update = async (action: () => Promise<ShopperStatus>) => {
    setBusy(true);
    setError("");
    try {
      onStatus(await action());
    } catch (e) {
      applyShopperStatus(null);
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog ref={ref} className="privacy-dialog" onCancel={onClose} aria-labelledby="privacy-title">
      <section className="stack">
        <h2 id="privacy-title">Your privacy choices</h2>
        <p>
          Let Bluebird learn from the listings you open, searches, saves, active viewing time,
          photos you explore, and seller-contact actions. This improves recommendations across
          Bluebird's app and website when you are signed in. Shopping alerts and advertising
          permission are separate.
        </p>
        {!status ? (
          <>
            <p>Privacy choices could not be loaded.</p>
            <button disabled={busy} onClick={() => void update(shopperStatus)}>
              Retry
            </button>
          </>
        ) : (
          <label className="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={status.personalization}
              onChange={(e) => void update(() => updatePersonalization(e.target.checked))}
            />
            Personalized recommendations and shopping history
          </label>
        )}
        <p className="muted">
          {userId
            ? "Your signed-in shopping choices and history are shared across Bluebird’s website and apps."
            : "Guest shopping uses a resettable identifier for this installation. We do not merge guest activity into a different person’s account."}{" "}
          Bluebird’s apps do not use device fingerprinting or read your activity in other apps.
        </p>
        <button
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                userId
                  ? "Clear shopping history across your Bluebird account? Your saved listings will remain saved."
                  : "Clear this installation’s shopping history and reset its guest identifier?",
              )
            )
              void update(clearShoppingHistory);
          }}
        >
          Clear shopping history
        </button>
        <p>
          <a href={`${apiOrigin}/privacy`} target="_blank" rel="noreferrer">
            Privacy notice
          </a>{" "}
          ·{" "}
          <a href={`${apiOrigin}/terms`} target="_blank" rel="noreferrer">
            Terms of Service
          </a>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </section>
    </dialog>
  );
}

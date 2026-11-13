import { useEffect, useRef, useState } from "react";
import type { MobileListing } from "../../../src/lib/mobile-contract";
import { api, apiOrigin } from "./client";
import { isShoppingForeground } from "./shopping-activity";
import {
  applyShopperStatus,
  clearShoppingHistory,
  dismissShopping,
  shopperStatus,
  trackShopping,
  updatePersonalization,
  type ShopperStatus,
  type RecommendationRows,
} from "./shopping";

export function ListingTile({
  card,
  position,
  placement = "browse",
  model = "browse-v1",
  learning,
  onOpen,
}: {
  card: MobileListing;
  position: number;
  placement?: string;
  model?: string;
  learning: boolean;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null),
    [failed, setFailed] = useState(false);
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
        document.querySelector("dialog[open]")
      )
        return;
      timer = setTimeout(() => {
        if (
          intersecting &&
          isShoppingForeground() &&
          document.visibilityState === "visible" &&
          !document.querySelector("dialog[open]")
        )
          trackShopping("impression", card.id, {
            position,
            placement,
            model,
            source: placement === "browse" || placement === "saved" ? "browse" : "recommendation",
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
    document.addEventListener("visibilitychange", assess);
    document.addEventListener("bluebird-visibility-change", assess);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", assess);
      document.removeEventListener("bluebird-visibility-change", assess);
    };
  }, [card.id, card.shoppingFeatures, learning, model, placement, position]);
  const price =
    card.priceLabel ??
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: card.currency || "USD",
      maximumFractionDigits: 0,
    }).format(card.priceCents / 100);
  return (
    <button
      ref={ref}
      className="listing-card"
      onClick={() => {
        if (placement !== "browse" && placement !== "saved")
          trackShopping("recommendation_click", card.id, {
            position,
            placement,
            model,
            source: "recommendation",
            ...card.shoppingFeatures,
          });
        onOpen(card.id);
      }}
    >
      {card.imageUrl && !failed ? (
        <img src={card.imageUrl} loading="lazy" alt="" onError={() => setFailed(true)} />
      ) : (
        <div className="photo-missing">Photo unavailable</div>
      )}
      <div>
        <strong>{price}</strong>
        <h2>{card.title}</h2>
        <p>{[card.city, card.state].filter(Boolean).join(", ")}</p>
        {card.source && <small>{card.source}</small>}
      </div>
    </button>
  );
}
export function ShoppingRows({
  learning,
  onOpen,
  revision,
  similarId,
}: {
  learning: boolean;
  onOpen: (id: string) => void;
  revision: number;
  similarId?: string;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [rows, setRows] = useState<RecommendationRows | null>(null),
    [dismissed, setDismissed] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    setRows(null);
    setDismissed([]);
    setError("");
    if (!learning && !similarId) return;
    const controller = new AbortController();
    const load = similarId
      ? api<{ cards: MobileListing[]; model: string }>(
          `similar?listingId=${encodeURIComponent(similarId)}`,
          "GET",
          undefined,
          controller.signal,
        ).then((r) => ({ recent: [], continuing: [], recommended: r.cards, model: r.model }))
      : api<RecommendationRows>("recommendations", "GET", undefined, controller.signal);
    load.then(setRows).catch(() => {
      /* Browsing remains the useful fallback. */
    });
    return () => controller.abort();
  }, [learning, revision, similarId]);
  if (!rows || (!learning && !similarId)) return null;
  const groups: [string, string, MobileListing[]][] = similarId
    ? [["Similar listings", "similar", rows.recommended]]
    : [
        ["Recently viewed", "recent", rows.recent],
        ["Continue shopping", "continuing", rows.continuing],
        ["Recommended for you", "recommended", rows.recommended],
      ];
  return (
    <div className="stack recommendations">
      {groups.map(([label, placement, items]) => {
        const visible = items.filter((c) => !dismissed.includes(c.id));
        if (!visible.length) return null;
        return (
          <section className="stack" key={placement}>
            <h2>{label}</h2>
            <div className="listing-grid">
              {visible.map((card, position) => (
                <div className="recommendation-item" key={card.id}>
                  <ListingTile
                    card={card}
                    position={position}
                    placement={placement}
                    model={rows.model}
                    learning={learning}
                    onOpen={onOpen}
                  />
                  {learning && (
                    <button
                      className="dismiss"
                      aria-label={`Dismiss ${card.title}`}
                      disabled={pending === card.id}
                      onClick={async () => {
                        setPending(card.id);
                        setError("");
                        try {
                          await dismissShopping(card.id);
                          setDismissed((d) => [...d, card.id]);
                        } catch (error) {
                          setError(
                            error instanceof Error
                              ? error.message
                              : "Your choice could not be saved.",
                          );
                        } finally {
                          setPending(null);
                        }
                      }}
                    >
                      Not interested
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {error && <p role="alert">{error}</p>}
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
          Bluebird can use your shopping activity to improve recommendations. This is separate from
          shopping alerts and advertising permission.
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
          Bluebird’s apps do not use device fingerprinting.
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

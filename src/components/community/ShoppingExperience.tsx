import { ShoppingAlertPreferenceView } from "./ShoppingAlertPreferenceView";
import { SignupShoppingChoices } from "./SignupShoppingChoices";
export { SignupShoppingChoices } from "./SignupShoppingChoices";
import { ShoppingPrivacyDialog } from "./ShoppingPrivacyDialog";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  hasShoppingPrivacyChoice,
  setShoppingPrivacy,
  shoppingFetch,
  shoppingPrivacy,
  shoppingTrack,
  flushShopping,
  startShopping,
} from "@/lib/shopping-client";
import { SHOPPING_POLICY_VERSION, type ShoppingCard } from "@/lib/shopping-contract";
import { ListingCard } from "@/components/classifieds/ListingCard";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

type ShoppingStatus = {
  signedIn: boolean;
  account?: { terms_version?: string; shopping_alerts?: boolean | null } | null;
  privacy?: { personalization: boolean; advertising: boolean } | null;
  advertising?: { metaPixel?: string; googleTag?: string };
};

export function ShoppingExperience() {
  const [privacyOpen, setPrivacyOpen] = useState(false),
    [privacy, setPrivacy] = useState(shoppingPrivacy),
    [status, setStatus] = useState<ShoppingStatus | null>(null),
    [accepted, setAccepted] = useState(false),
    [alerts, setAlerts] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () => {
    void shoppingFetch("status")
      .then(async (result) => {
        if (result.signedIn && result.account?.terms_version !== SHOPPING_POLICY_VERSION) {
          try {
            const pending = JSON.parse(sessionStorage.getItem("bb.shopping.signup") ?? "null");
            if (pending && Date.now() - pending.at < 3600000) {
              await shoppingFetch("consent", {
                acceptTerms: true,
                shoppingAlerts: pending.shoppingAlerts === true,
              });
              sessionStorage.removeItem("bb.shopping.signup");
              result = await shoppingFetch("status");
            }
          } catch {
            /* The explicit account choices remain available. */
          }
        }
        if (!result.privacy && shoppingPrivacy().personalization) setPrivacyOpen(true);
        void import("@/lib/shopping-advertising-client").then((m) => {
          if (
            shoppingPrivacy().advertising &&
            result.privacy?.advertising &&
            (result.advertising?.metaPixel || result.advertising?.googleTag)
          )
            m.configureShoppingAdvertising(result.advertising);
          else m.revokeShoppingAdvertising();
        });
        setStatus(result);
      })
      .catch(() => setStatus(null));
  };
  useEffect(() => {
    const stop = startShopping();
    setPrivacy(shoppingPrivacy());
    setPrivacyOpen(!hasShoppingPrivacyChoice());
    refresh();
    const open = () => {
      setPrivacy(shoppingPrivacy());
      setPrivacyOpen(true);
    };
    window.addEventListener("shopping-privacy-open", open);
    window.addEventListener("shopping-account-changed", refresh);
    window.addEventListener("shopping-privacy-changed", refresh);
    return () => {
      stop();
      window.removeEventListener("shopping-privacy-open", open);
      window.removeEventListener("shopping-account-changed", refresh);
      window.removeEventListener("shopping-privacy-changed", refresh);
    };
  }, []);
  const needsTerms =
    !/^\/(terms|privacy)/.test(typeof location === "undefined" ? "" : location.pathname) &&
    status?.signedIn &&
    status.account?.terms_version !== SHOPPING_POLICY_VERSION;
  const save = async () => {
    if (!accepted) return;
    setBusy(true);
    setError("");
    try {
      await shoppingFetch("consent", { acceptTerms: true, shoppingAlerts: alerts });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {privacyOpen && !needsTerms && (
        <ShoppingPrivacyDialog
          initialChoices={privacy}
          onSave={async (choices) => {
            await setShoppingPrivacy(choices);
            setPrivacy(shoppingPrivacy());
            setPrivacyOpen(false);
          }}
          onClearHistory={async () => {
            await shoppingFetch("clear", {});
            window.dispatchEvent(new Event("shopping-privacy-changed"));
          }}
        />
      )}
      {needsTerms && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Complete your account"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <section className="w-full max-w-md rounded-2xl bg-background p-6">
            <h2 className="mb-4 text-lg font-semibold">Complete your account</h2>
            <SignupShoppingChoices
              accepted={accepted}
              alerts={alerts}
              onAccepted={setAccepted}
              onAlerts={setAlerts}
            />
            {error && (
              <p role="alert" className="mt-3 text-sm">
                {error}
              </p>
            )}
            <button
              disabled={!accepted || busy}
              type="button"
              onClick={() => void save()}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50"
            >
              Continue
            </button>
          </section>
        </div>
      )}
    </>
  );
}
export function ShoppingAlertPreference() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void shoppingFetch("status")
      .then((r) => {
        setEnabled(r.account?.shopping_alerts === true);
        setReady(r.signedIn);
      })
      .catch(() => undefined);
  }, []);
  if (!ready) return null;
  return (
    <ShoppingAlertPreferenceView
      enabled={enabled}
      error={error}
      busy={busy}
      onChange={async (next) => {
        if (busy) return;
        setBusy(true);
        try {
          await shoppingFetch("consent", { shoppingAlerts: next });
          setEnabled(next);
          setError("");
        } catch {
          setError("Your preference could not be saved. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
export function PersonalizedShopping() {
  const [enabled, setEnabled] = useState(false),
    [revision, setRevision] = useState(0),
    [dismissed, setDismissed] = useState<string[]>([]);
  const cache = useQueryClient();
  useEffect(() => {
    const update = () => {
      setEnabled(shoppingPrivacy().personalization);
      cache.removeQueries({ queryKey: ["personalized-shopping"] });
      setDismissed([]);
      setRevision((r) => r + 1);
    };
    update();
    window.addEventListener("shopping-privacy-changed", update);
    window.addEventListener("shopping-account-changed", update);
    return () => {
      window.removeEventListener("shopping-privacy-changed", update);
      window.removeEventListener("shopping-account-changed", update);
    };
  }, [cache]);
  const result = useQuery({
    queryKey: ["personalized-shopping", enabled, revision],
    queryFn: () => shoppingFetch("recommendations"),
    enabled,
    staleTime: 60000,
    retry: false,
  });
  if (!enabled || !result.data) return null;
  return (
    <div className="mt-8 space-y-8">
      {[
        ["Recently viewed", result.data.recent],
        ["Continue shopping", result.data.continuing],
        ["Recommended for you", result.data.recommended],
      ].map(([title, items]) =>
        Array.isArray(items) && items.length > 0 ? (
          <section key={title as string}>
            <h2 className="mb-4 text-lg font-semibold">{title as string}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(items as ShoppingCard[])
                .filter((c) => !dismissed.includes(c.id))
                .slice(0, 4)
                .map((card, index) => (
                  <div
                    key={card.id}
                    onClick={() =>
                      shoppingTrack("recommendation_click", card.id, {
                        placement: title,
                        position: index,
                        model: result.data.model,
                      })
                    }
                  >
                    <ListingCard
                      listing={card as unknown as ListingCardSummary}
                      shoppingContext={{
                        placement: title,
                        position: index,
                        model: result.data.model,
                        source: "recommendation",
                        ...((card.shoppingFeatures as Record<string, number>) ?? {}),
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDismissed((ids) => [...ids, card.id]);
                        shoppingTrack("dismiss", card.id);
                        void flushShopping().then(() => result.refetch());
                      }}
                      className="mt-2 text-xs text-muted-foreground underline"
                    >
                      Not interested
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

export function VisualSimilarShopping({ listingId }: { listingId: string }) {
  const query = useQuery({
    queryKey: ["visual-similar-shopping", listingId],
    queryFn: () => shoppingFetch("similar", undefined, { listing: listingId }),
    staleTime: 300000,
    retry: false,
  });
  if (!query.data?.cards?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">More like this</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {query.data.cards.slice(0, 4).map((card: ShoppingCard, index: number) => (
          <ListingCard
            key={card.id}
            listing={card as unknown as ListingCardSummary}
            shoppingContext={{
              placement: "visual_similar",
              source: "siglip2",
              model: query.data.model,
              position: index,
            }}
          />
        ))}
      </div>
    </section>
  );
}

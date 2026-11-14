import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListingsSectionView,
  type SellerListingLinkProps,
} from "../../../src/components/account/ListingsSectionView";
import type { MobileAccountListings } from "../../../src/lib/mobile-account-listings.server";
import { api } from "./client";
import { installIdentifier } from "./identity";
import {
  clearListingAttempt,
  readListingAttempt,
  storeListingAttempt,
  submitListingAttempt,
  listingChanged,
  listingDefinitelyRejected,
  type ListingAttempt,
} from "./listing-management-attempts";
const text = (e: unknown) =>
  e instanceof Error ? e.message : "Your listings could not be loaded. Please retry.";
function sellerListingDestination(
  p: Pick<SellerListingLinkProps, "to" | "params" | "search">,
): string | null {
  if (p.to === "/seller-setup") return "/post/profile";
  if (p.to === "/create-listing")
    return p.search?.duplicateFrom ? `/post/duplicate/${p.search.duplicateFrom}` : "/post";
  if (p.to === "/account") return p.search?.section === "messages" ? "/messages" : null;
  if (!p.params?.listingId || !/^[0-9a-f-]{36}$/i.test(p.params.listingId)) return null;
  return p.to === "/listings/$listingId/edit"
    ? `/post/edit/${p.params.listingId}`
    : `/listings/${p.params.listingId}`;
}
export function NativeAccountListings({
  ownerId,
  managementReady,
  onNavigate,
}: {
  ownerId: string;
  managementReady: boolean;
  onNavigate: (path: string) => void;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [loaded, setLoaded] = useState<MobileAccountListings | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState("");
  const [pending, setPending] = useState(() => readListingAttempt(ownerId));
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && actor.installId === installIdentifier();
  useEffect(() => {
    const c = new AbortController(),
      signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
    setLoaded(null);
    setError("");
    api<MobileAccountListings>("account/listings", "GET", undefined, signal, actor)
      .then((data) => {
        if (c.signal.aborted || actor.installId !== installIdentifier()) return;
        if (data.ownerId !== ownerId) throw Error("Your account changed. Please sign in again.");
        setLoaded(data);
      })
      .catch((e) => {
        if (!c.signal.aborted && actor.installId === installIdentifier()) setError(text(e));
      });
    return () => c.abort();
  }, [actor, ownerId, refresh]);
  async function change(id?: string, action?: "archive" | "relist") {
    if (lock.current || !managementReady) return;
    lock.current = true;
    setBusy(id ?? pending?.listingId ?? "");
    setError("");
    setNotice("");
    let attempt = pending;
    try {
      if (!attempt && id && action) {
        const data = await api<{ ownerId: string; listingId: string; version: string }>(
          `account/listings/${id}/version`,
          "GET",
          undefined,
          undefined,
          actor,
        );
        if (!current()) return;
        if (
          data.ownerId !== ownerId ||
          data.listingId !== id ||
          !/^[0-9a-f]{64}$/.test(data.version)
        )
          throw Error("Your listing could not be confirmed. Please retry.");
        attempt = {
          requestId: crypto.randomUUID(),
          listingId: id,
          version: data.version,
          action,
          input: {},
        };
        storeListingAttempt(ownerId, attempt);
        setPending(attempt);
      }
      if (!attempt) return;
      await submitListingAttempt(ownerId, attempt);
      clearListingAttempt(ownerId);
      if (!current()) return;
      setPending(null);
      setNotice("Listing updated. The latest status is shown below.");
      setRefresh((n) => n + 1);
    } catch (e) {
      if (!current()) return;
      if (attempt && (listingChanged(e) || (!pending && listingDefinitelyRejected(e)))) {
        clearListingAttempt(ownerId);
        setPending(null);
        setRefresh((n) => n + 1);
      }
      setError(text(e));
    } finally {
      lock.current = false;
      if (current()) setBusy("");
    }
  }
  function Link(props: SellerListingLinkProps) {
    const dest = sellerListingDestination(props);
    return (
      <a
        href={dest ? "#" + dest : undefined}
        className={props.className}
        onClick={(e) => {
          e.preventDefault();
          if (dest) onNavigate(dest);
        }}
      >
        {props.children}
      </a>
    );
  }
  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}{" "}
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Reload listings
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm">
          {notice}
        </p>
      )}
      {!managementReady && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Listing changes are temporarily unavailable. You can still view listings and messages.
        </p>
      )}
      {pending && (
        <div role="status" className="mb-4 border border-border p-4 text-sm">
          Confirm your previous listing change before starting another.
          <button
            type="button"
            disabled={Boolean(busy) || !managementReady}
            className="ml-2 min-h-11 underline"
            onClick={() => void change()}
          >
            Retry listing change
          </button>
          {pending.action === "edit" && (
            <button
              type="button"
              className="ml-2 min-h-11 underline"
              onClick={() => onNavigate(`/post/edit/${pending.listingId}`)}
            >
              Continue editing
            </button>
          )}
        </div>
      )}
      {loaded ? (
        <ListingsSectionView
          listings={loaded.listings}
          sellerExists={loaded.sellerExists}
          link={Link}
          menuPlacement="above"
          paidFeatures={false}
          legacyNote={false}
          managementAvailable={managementReady && !pending && !busy}
          busyListingId={busy}
          unavailableMetrics={loaded.unavailableMetrics}
          actionForItem={(item) =>
            item.status === "active" && !item.soldAt
              ? "archive"
              : ["cancelled", "expired"].includes(item.status) && !item.soldAt
                ? "relist"
                : null
          }
          onTakeDown={(id) => void change(id, "archive")}
          onRelist={(id) => void change(id, "relist")}
          thumbnail={(item) => (
            <OwnedThumbnail key={item.id} ownerId={ownerId} listingId={item.id} />
          )}
        />
      ) : (
        !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your listings…
          </p>
        )
      )}
    </>
  );
}
function OwnedThumbnail({ ownerId, listingId }: { ownerId: string; listingId: string }) {
  const element = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [url, setUrl] = useState<string | null>(null),
    [state, setState] = useState("loading");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const c = new AbortController(),
      actor = { userId: ownerId, installId: installIdentifier() };
    api<{ url: string | null }>(
      `account/listings/${listingId}/thumbnail`,
      "GET",
      undefined,
      AbortSignal.any([c.signal, AbortSignal.timeout(20000)]),
      actor,
    )
      .then((r) => {
        if (!c.signal.aborted) {
          setUrl(r.url);
          setState(r.url ? "ready" : "empty");
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setState("error");
      });
    return () => c.abort();
  }, [visible, ownerId, listingId]);
  return (
    <div
      ref={element}
      className="grid size-full place-items-center text-[11px] text-muted-foreground"
    >
      {url && state === "ready" ? (
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          onError={() => setState("error")}
        />
      ) : state === "error" ? (
        "Photo unavailable"
      ) : state === "empty" ? (
        "No photo"
      ) : (
        "Loading photo…"
      )}
    </div>
  );
}

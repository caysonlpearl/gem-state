import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "@phosphor-icons/react";
import type { MobileBrowse, MobileListing } from "../../../src/lib/mobile-contract";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { trackShopping } from "./shopping";
import { trackAdvertising } from "./advertising";

type SavedState = {
  userId: string | null;
  ids: Set<string>;
  ready: boolean;
  busy: Set<string>;
  toggle: (card: MobileListing) => void;
};
const SavedCards = createContext<SavedState | null>(null);
export function SavedCardsProvider({
  userId,
  revision,
  onError,
  children,
}: {
  userId: string | null;
  revision: number;
  onError: (message: string) => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<{ owner: string | null; ids: Set<string>; ready: boolean }>({
    owner: null,
    ids: new Set(),
    ready: false,
  });
  const [busy, setBusy] = useState(new Set<string>());
  const pending = useRef(new Set<string>());
  const current = useRef(userId);
  current.current = userId;
  useEffect(() => {
    setState({ owner: userId, ids: new Set(), ready: false });
    setBusy(new Set());
    pending.current.clear();
    if (!userId) return;
    let alive = true;
    const controller = new AbortController();
    const load = () =>
      api<MobileBrowse>("saved", "GET", undefined, controller.signal, {
        userId,
        installId: installIdentifier(),
      })
        .then((result) => {
          if (alive)
            setState({ owner: userId, ids: new Set(result.items.map((c) => c.id)), ready: true });
        })
        .catch(() => {
          if (alive) setState({ owner: userId, ids: new Set(), ready: false });
        });
    void load();
    const refresh = () => void load();
    window.addEventListener("bluebird-saved-changed", refresh);
    return () => {
      alive = false;
      controller.abort();
      window.removeEventListener("bluebird-saved-changed", refresh);
    };
  }, [userId, revision]);
  const ids = state.owner === userId ? state.ids : new Set<string>();
  const toggle = async (card: MobileListing) => {
    if (!userId) {
      location.hash = "/account";
      return;
    }
    if (!state.ready) {
      onError("Your saved listings could not be loaded. Open Saved to try again.");
      return;
    }
    const key = `${userId}:${card.id}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setBusy(new Set(pending.current));
    const saved = !ids.has(card.id);
    try {
      await api("saved", "POST", { listingId: card.id, saved }, undefined, {
        userId,
        installId: installIdentifier(),
      });
      if (current.current !== userId) return;
      setState((previous) => {
        const next = new Set(previous.ids);
        if (saved) next.add(card.id);
        else next.delete(card.id);
        return { owner: userId, ids: next, ready: true };
      });
      trackShopping(saved ? "save" : "unsave", card.id);
      if (saved) void trackAdvertising("listing_saved", card.categorySlug);
    } catch (error) {
      if (current.current === userId)
        onError(
          error instanceof Error ? error.message : "Your saved listing could not be updated.",
        );
    } finally {
      pending.current.delete(key);
      if (current.current === userId) setBusy(new Set(pending.current));
    }
  };
  return (
    <SavedCards.Provider
      value={{ userId, ids, ready: state.ready && state.owner === userId, busy, toggle }}
    >
      {children}
    </SavedCards.Provider>
  );
}
export function CardSaveButton({ card }: { card: MobileListing }) {
  const state = useContext(SavedCards);
  if (!state || !card.canSave) return null;
  const saved = state.ids.has(card.id),
    busy = state.busy.has(`${state.userId}:${card.id}`);
  return (
    <button
      type="button"
      aria-label={
        !state.userId
          ? `Sign in to save ${card.title}`
          : saved
            ? `Remove ${card.title} from saved listings`
            : `Save ${card.title}`
      }
      aria-pressed={state.userId && state.ready ? saved : undefined}
      disabled={busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void state.toggle(card);
      }}
      className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card/95 p-0 text-muted-foreground shadow-sm backdrop-blur before:absolute before:-inset-2 before:content-[''] hover:border-primary hover:text-primary disabled:opacity-60"
    >
      <Heart
        size={14}
        weight={saved ? "fill" : "regular"}
        className={saved ? "text-brand-warm" : undefined}
      />
    </button>
  );
}

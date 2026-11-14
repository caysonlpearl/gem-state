/* eslint-disable react-refresh/only-export-components -- the saved-account hook shares its provider's account-scoped state. */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "@phosphor-icons/react";
import type { MobileBrowse, MobileListing } from "../../../src/lib/mobile-contract";
import { api } from "./client";
import type { MobileSavedAccount } from "../../../src/lib/mobile-account-contract";
import { installIdentifier } from "./identity";
import { trackShopping } from "./shopping";
import { trackAdvertising } from "./advertising";

type SavedState = {
  userId: string | null;
  ids: Set<string>;
  ready: boolean;
  busy: Set<string>;
  toggle: (card: MobileListing) => void;
  account: MobileSavedAccount | null;
  error: string;
  refresh: () => Promise<void>;
};
const SavedCards = createContext<SavedState | null>(null);
export function SavedCardsProvider({
  userId,
  revision,
  accountSaved = false,
  onError,
  children,
}: {
  userId: string | null;
  revision: number;
  accountSaved?: boolean;
  onError: (message: string) => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    owner: string | null;
    ids: Set<string>;
    ready: boolean;
    account: MobileSavedAccount | null;
    error: string;
  }>({ owner: null, ids: new Set(), ready: false, account: null, error: "" });
  const [busy, setBusy] = useState(new Set<string>());
  const pending = useRef(new Set<string>());
  const current = useRef(userId);
  const refresh = useRef<() => Promise<void>>(async () => {});
  current.current = userId;
  useEffect(() => {
    setState({ owner: userId, ids: new Set(), ready: false, account: null, error: "" });
    setBusy(new Set());
    pending.current.clear();
    let alive = true,
      version = 0;
    let controller: AbortController | undefined;
    const installId = installIdentifier();
    const load = async () => {
      if (!userId || !alive || current.current !== userId || installIdentifier() !== installId)
        return;
      const run = ++version;
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await api<MobileBrowse | MobileSavedAccount>(
          accountSaved ? "account/saved" : "saved",
          "GET",
          undefined,
          controller.signal,
          { userId, installId },
        );
        if (
          !alive ||
          run !== version ||
          current.current !== userId ||
          installIdentifier() !== installId
        )
          return;
        let account: MobileSavedAccount | null = null;
        let ids: Set<string>;
        if (accountSaved) {
          account = result as MobileSavedAccount;
          if (
            account.ownerId !== userId ||
            ![account.watched, account.jobs, account.homes, account.vehicles].every(Array.isArray)
          )
            throw Error("Your saved listings could not be loaded. Please retry.");
          ids = new Set([
            ...account.watched.flatMap((w) => (w.listingId ? [w.listingId] : [])),
            ...account.jobs.map((c) => c.id),
            ...account.homes.map((c) => c.id),
            ...account.vehicles.map((c) => c.id),
          ]);
        } else ids = new Set((result as MobileBrowse).items.map((c) => c.id));
        setState({ owner: userId, ids, ready: true, account, error: "" });
      } catch (error) {
        if (
          !alive ||
          run !== version ||
          current.current !== userId ||
          installIdentifier() !== installId
        )
          return;
        const message =
          error instanceof Error
            ? error.message
            : "Your saved listings could not be loaded. Please retry.";
        setState({ owner: userId, ids: new Set(), ready: false, account: null, error: message });
        throw error;
      }
    };
    refresh.current = load;
    void load().catch(() => {});
    const changed = () => void load().catch(() => {});
    window.addEventListener("bluebird-saved-changed", changed);
    return () => {
      alive = false;
      controller?.abort();
      window.removeEventListener("bluebird-saved-changed", changed);
    };
  }, [userId, revision, accountSaved]);
  const ids = state.owner === userId ? state.ids : new Set<string>();
  const toggle = async (card: MobileListing) => {
    if (!userId) {
      location.hash = "/account";
      return;
    }
    if (!state.ready || state.owner !== userId) {
      onError("Your saved listings could not be loaded. Open Saved to try again.");
      return;
    }
    const key = `${userId}:${card.id}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setBusy(new Set(pending.current));
    const saved = !ids.has(card.id);
    try {
      const privacyRemoval = accountSaved && !saved;
      const variant = privacyRemoval
        ? state.account?.watched.find((w) => w.listingId === card.id)
        : undefined;
      const outcome = await api<{
        removed?: boolean;
        stats?: { views: number; favorites: number } | null;
      }>(
        privacyRemoval ? (variant ? "account/saved" : "account/saved/partner") : "saved",
        privacyRemoval ? "DELETE" : "POST",
        privacyRemoval
          ? variant
            ? { variantIds: [variant.variantId] }
            : { listingId: card.id }
          : { listingId: card.id, saved },
        undefined,
        {
          userId,
          installId: installIdentifier(),
        },
      );
      if (current.current !== userId) return;
      if (privacyRemoval && outcome?.removed !== true)
        throw Error("Could not confirm removal. Please retry.");
      setState((previous) => {
        const next = new Set(previous.ids);
        if (saved) next.add(card.id);
        else next.delete(card.id);
        return { ...previous, owner: userId, ids: next, ready: true };
      });
      if (
        outcome?.stats &&
        Number.isFinite(outcome.stats.views) &&
        Number.isFinite(outcome.stats.favorites)
      )
        document.dispatchEvent(
          new CustomEvent("bluebird-listing-stats", {
            detail: { listingId: card.id, stats: outcome.stats },
          }),
        );
      trackShopping(saved ? "save" : "unsave", card.id);
      if (saved) void trackAdvertising("listing_saved", card.categorySlug);
      if (accountSaved) void refresh.current().catch(() => {});
    } catch (error) {
      if (accountSaved && current.current === userId) void refresh.current().catch(() => {});
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
      value={{
        userId,
        ids,
        ready: state.ready && state.owner === userId,
        busy,
        toggle,
        account: state.owner === userId ? state.account : null,
        error: state.owner === userId ? state.error : "",
        refresh: () => refresh.current(),
      }}
    >
      {children}
    </SavedCards.Provider>
  );
}
export function useNativeSavedAccount() {
  const state = useContext(SavedCards);
  if (!state) throw Error("Saved account provider is missing.");
  return state;
}
export function CardSaveButton({
  card,
  className,
  iconSize = 14,
  onSignIn,
}: {
  card: MobileListing;
  className?: string;
  iconSize?: number;
  onSignIn?: () => void;
}) {
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
        if (!state.userId && onSignIn) onSignIn();
        else void state.toggle(card);
      }}
      className={
        className ??
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card/95 p-0 text-muted-foreground shadow-sm backdrop-blur before:absolute before:-inset-2 before:content-[''] hover:border-primary hover:text-primary disabled:opacity-60"
      }
    >
      <Heart
        size={iconSize}
        weight={saved ? "fill" : "regular"}
        className={saved ? "text-brand-warm" : undefined}
      />
    </button>
  );
}

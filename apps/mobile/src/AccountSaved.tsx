import { useEffect, useMemo, useRef, useState } from "react";
import {
  SavedListingsSectionView,
  type SavedListingLinkProps,
} from "../../../src/components/account/SavedListingsSectionView";
import { SavedPartnerSectionView } from "../../../src/components/account/SavedPartnerSectionView";
import {
  PartnerJobsCredit,
  PartnerVehiclesCredit,
} from "../../../src/components/classifieds/ListingCardView";
import { useNativeSavedAccount } from "./SavedCards";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { nativeListingDestination } from "./listing-links";
import { listingPresentation } from "./listing-presentation";
import { ListingTile } from "./ShopperExperience";
import { trackShopping } from "./shopping";
export function NativeAccountSaved({
  ownerId,
  onNavigate,
}: {
  ownerId: string;
  onNavigate: (path: string) => void;
}) {
  const saved = useNativeSavedAccount();
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const mounted = useRef(true),
    locked = useRef(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current && saved.userId === ownerId && actor.installId === installIdentifier();
  async function remove(ids: string[], bulk = false) {
    if (locked.current) throw Error("A saved-listing change is still finishing.");
    locked.current = true;
    setBusy(bulk ? "bulk" : ids[0]);
    setError("");
    try {
      for (let offset = 0; offset < ids.length; offset += 100) {
        if (!current()) throw Error("Your account changed. Please try again.");
        const result = await api<{ removed: boolean }>(
          "account/saved",
          "DELETE",
          { variantIds: ids.slice(offset, offset + 100) },
          undefined,
          actor,
        );
        if (result?.removed !== true) throw Error("Could not confirm removal. Please retry.");
        if (!current()) return;
        for (const id of ids.slice(offset, offset + 100)) {
          const listing = saved.account?.watched.find((w) => w.variantId === id)?.listingId;
          if (listing) trackShopping("unsave", listing);
        }
      }
      await saved.refresh();
    } catch (e) {
      if (current()) {
        setError(e instanceof Error ? e.message : "Could not remove saved listings. Please retry.");
        await saved.refresh().catch(() => {});
      }
      throw e;
    } finally {
      locked.current = false;
      if (current()) setBusy("");
    }
  }
  function Link({ to, params, search, ...props }: SavedListingLinkProps) {
    const dest = nativeListingDestination(to, params, search);
    return (
      <a
        {...props}
        href={dest ? "#" + dest : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (dest) onNavigate(dest);
        }}
      />
    );
  }
  const account = saved.account?.ownerId === ownerId ? saved.account : null;
  if (saved.error && !account)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      >
        {saved.error}
        <button
          type="button"
          className="ml-3 min-h-11 font-semibold underline"
          onClick={() => void saved.refresh().catch(() => {})}
        >
          Retry saved listings
        </button>
      </div>
    );
  if (!account)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading saved listings…
      </p>
    );
  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <SavedListingsSectionView
        items={account.watched}
        link={Link}
        onRemove={(id) => void remove([id]).catch(() => {})}
        onRemoveSelected={(ids) => remove(ids, true)}
        removingId={busy === "bulk" ? undefined : busy}
        bulkRemoving={busy === "bulk"}
      />
      {(["jobs", "homes", "vehicles"] as const).map((kind) => (
        <SavedPartnerSectionView
          key={kind}
          kind={kind}
          items={account[kind]}
          renderCard={(card, position) => (
            <ListingTile
              key={card.id}
              card={card}
              position={position}
              placement="saved"
              learning={false}
              onOpen={(id) => onNavigate("/listings/" + id)}
            />
          )}
          credit={
            kind === "jobs" ? (
              <PartnerJobsCredit listings={account.jobs.map(listingPresentation)} />
            ) : kind === "vehicles" ? (
              <PartnerVehiclesCredit listings={account.vehicles.map(listingPresentation)} />
            ) : undefined
          }
        />
      ))}
    </>
  );
}

import { Share } from "@capacitor/share";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import { toast } from "sonner";
import type { ContactSignInSheet } from "../../../src/components/classifieds/ContactSignInSheet";
import { ContactSignInSheetView } from "../../../src/components/classifieds/ContactSignInSheetView";
import type { ListingActionsProps } from "../../../src/components/classifieds/ListingActionsView";
import { ListingActionsView } from "../../../src/components/classifieds/ListingActionsView";
import { MobileContactBarView } from "../../../src/components/classifieds/MobileContactBarView";
import { VehiclePriceInsightView } from "../../../src/components/dealers/VehiclePriceInsightView";
import type {
  DetailLinkProps,
  ListingDetailRuntime,
} from "../../../src/components/listings/listing-detail-runtime";
import {
  ClaimBusinessPanelView,
  ClaimEmployerPanelView,
  FlagListingDialogView,
  type ClaimRuntime,
} from "../../../src/components/listings/ListingDetailControlsView";
import {
  EndedListingBanner,
  ListingDetailView,
  listingDetailTitle,
} from "../../../src/components/listings/ListingDetailView";
import type { ClassifiedDetail } from "../../../src/lib/classifieds.functions";
import { rememberContactIntent } from "../../../src/lib/listing-contact-events";
import { listingIdFromParam, listingPath } from "../../../src/lib/listing-url";
import { mobileListingDetail } from "../../../src/lib/mobile-listing-detail";
import type { VehiclePriceInsight } from "../../../src/lib/vehicle-price-insights";
import { trackAdvertising } from "./advertising";
import { rememberNativeAuthDestination } from "./auth-destination";
import { api, apiOrigin, auth, socialLogin } from "./client";
import { installIdentifier } from "./identity";
import { detailCard } from "./listing-card-data";
import { nativeListingDestination } from "./listing-links";
import { NativeJobApplicationForm } from "./ListingJobApplication";
import { sendMessageOnce } from "./message-retries";
import { handleNativePublicLink } from "./public-links";
import { CardSaveButton } from "./SavedCards";
import { ListingTile, ShoppingRows } from "./ShopperExperience";
import { trackShopping } from "./shopping";
import { useListingActivity } from "./shopping-activity";
export type MobileDetailResult = {
  listing: ClassifiedDetail;
  stats: { views: number; favorites: number } | null;
  canSave: boolean;
  canMessage: boolean;
};
type DetailState = {
  data: MobileDetailResult;
  owner?: string;
  learning: boolean;
  applicationsReady: boolean;
};
const Detail = createContext<DetailState | null>(null);
export function useCurrentListingDetail() {
  const d = useContext(Detail);
  if (!d) throw Error("Missing listing details");
  return d;
}
function NativeDetailLink({ to, params, search, onClick, ...props }: DetailLinkProps) {
  const current = useCurrentListingDetail();
  const dest = nativeListingDestination(to, params, search);
  return (
    <a
      {...props}
      href={dest ? `#${dest}` : undefined}
      onClick={(e) => {
        if (to === "/auth") rememberNativeAuthDestination(`/listings/${current.data.listing.id}`);
        onClick?.(e);
        if (!dest) {
          e.preventDefault();
          toast.error("This destination is unavailable in the app.");
        }
      }}
    />
  );
}
async function actorStillCurrent(owner?: string, install = installIdentifier()) {
  const s = (await auth.auth.getSession()).data.session;
  if (s?.user.id !== owner || install !== installIdentifier())
    throw Error("Your account changed. Please try again.");
}
const onContact: ListingDetailRuntime["onContact"] = (method, listing) => {
  trackShopping("contact_open", listing.id, { method });
};
function NativeDetailSave({ className }: { className?: string }) {
  const { data } = useCurrentListingDetail(),
    [open, setOpen] = useState(false);
  return (
    <>
      <CardSaveButton
        card={detailCard(data.listing, data.canSave)}
        className={className}
        iconSize={18}
        onSignIn={() => setOpen(true)}
      />
      <NativeContactSheet
        listingId={data.listing.id}
        open={open}
        onOpenChange={setOpen}
        onSignedIn={() => setOpen(false)}
        saveIntent
      />
    </>
  );
}
function NativeEmbeddedCard({ listing }: ComponentProps<ListingDetailRuntime["ListingCard"]>) {
  const { learning, data } = useCurrentListingDetail();
  return (
    <ListingTile
      card={detailCard(listing as ClassifiedDetail)}
      position={Math.max(
        0,
        [
          ...(data.listing.communityListings ?? []),
          ...(data.listing.employerListings ?? []),
        ].findIndex((c) => c.id === listing.id),
      )}
      placement="listing:context"
      learning={learning}
      onOpen={(id) => {
        location.hash = `/listings/${id}`;
      }}
    />
  );
}
function WebsiteOnlyAdministration() {
  return null;
}
function NativeDetailFlag(props: { listingId: string; isMock?: boolean }) {
  const { owner } = useCurrentListingDetail();
  const actor = { userId: owner ?? null, installId: installIdentifier() };
  return (
    <FlagListingDialogView
      {...props}
      isSignedIn={Boolean(owner)}
      renderLink={NativeDetailLink}
      onReport={(data) => api("reports", "POST", data, undefined, actor)}
    />
  );
}
function claimRuntime(listingId: string, owner?: string): ClaimRuntime {
  const actor = { userId: owner ?? null, installId: installIdentifier() };
  return {
    isSignedIn: Boolean(owner),
    renderLink: NativeDetailLink,
    getClaim: () => api(`listings/${listingId}/claim`, "GET", undefined, undefined, actor),
    submitClaim: (body) => api(`listings/${listingId}/claim`, "POST", body, undefined, actor),
  };
}
function NativeEmployerClaim(props: ComponentProps<ListingDetailRuntime["ClaimEmployerPanel"]>) {
  const { owner } = useCurrentListingDetail();
  return <ClaimEmployerPanelView {...props} runtime={claimRuntime(props.listing.id, owner)} />;
}
function NativeBusinessClaim(props: ComponentProps<ListingDetailRuntime["ClaimBusinessPanel"]>) {
  const { owner } = useCurrentListingDetail();
  return <ClaimBusinessPanelView {...props} runtime={claimRuntime(props.listing.id, owner)} />;
}
function NativePriceInsight({ listingId }: { listingId: string }) {
  const q = useQuery({
    queryKey: ["price-insight", listingId],
    queryFn: () =>
      api<VehiclePriceInsight | { status: "unavailable"; reason: string } | null>(
        `listings/${listingId}/price-insight`,
      ),
    retry: false,
    staleTime: 5 * 60000,
    refetchOnWindowFocus: false,
  });
  return (
    <VehiclePriceInsightView
      value={q.isError ? { status: "unavailable", reason: "service_unavailable" } : q.data}
    />
  );
}
function NativeContactSheet({
  saveIntent = false,
  ...props
}: ComponentProps<typeof ContactSignInSheet> & { saveIntent?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const remember = () => {
    rememberNativeAuthDestination(`/listings/${props.listingId}`);
    if (!saveIntent) rememberContactIntent(props.listingId);
  };
  const social = async (provider: "google" | "apple") => {
    if (busy) return;
    setBusy(true);
    setError("");
    remember();
    try {
      await socialLogin(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!props.open) {
      setEmail("");
      setPassword("");
      setError("");
    }
  }, [props.open]);
  return (
    <ContactSignInSheetView
      {...props}
      email={email}
      password={password}
      busy={busy}
      onEmail={setEmail}
      onPassword={setPassword}
      handleGoogle={() => void social("google")}
      signupUrl="#/auth?mode=signup"
      forgotUrl="#/auth?mode=forgot"
      rememberContact={remember}
      error={error}
      title={saveIntent ? "Sign in to save this listing" : undefined}
      description={
        saveIntent ? "You'll come right back to this listing after you sign in." : undefined
      }
      appleAction={
        <button
          type="button"
          disabled={busy}
          onClick={() => void social("apple")}
          className="mt-2 h-12 w-full rounded-full border border-input text-[14.5px] font-semibold"
        >
          Continue with Apple
        </button>
      }
      handleSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        remember();
        void auth.auth
          .signInWithPassword({ email: email.trim(), password })
          .then(({ error }) => {
            if (error) throw error;
            setPassword("");
            props.onSignedIn();
          })
          .catch((e) => setError(e instanceof Error ? e.message : "Sign in failed."))
          .finally(() => setBusy(false));
      }}
    />
  );
}
function NativeListingActions(props: ListingActionsProps) {
  const { owner } = useCurrentListingDetail();
  return (
    <ListingActionsView
      {...props}
      runtime={{
        isSignedIn: Boolean(owner),
        userId: owner,
        onContact,
        onContactOpened: () =>
          trackShopping("contact_open", props.listing.id, { method: "message" }),
        onCompletedInquiry: (_method, _id, listing) => {
          trackShopping("contact", listing.id, { method: "message" });
          void trackAdvertising("seller_contacted", listing.categorySlug ?? "general");
          document.dispatchEvent(new Event("bluebird-inbox-changed"));
        },
        onSend: async (payload) => {
          if (!owner) throw Error("Please sign in to send a message.");
          const install = installIdentifier();
          await actorStillCurrent(owner, install);
          const result = await sendMessageOnce<{ conversationId: string }>(
            owner,
            "conversations",
            payload,
          );
          await actorStillCurrent(owner, install);
          return result;
        },
        ContactSignInSheet: NativeContactSheet,
        JobApplicationForm: NativeJobApplicationForm,
      }}
    />
  );
}
export function NativeListingDetail({
  id,
  owner,
  learning,
  revision,
  applicationsReady = false,
}: {
  id: string;
  owner?: string;
  learning: boolean;
  revision: number;
  applicationsReady?: boolean;
}) {
  const [data, setData] = useState<MobileDetailResult | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const listingId = listingIdFromParam(id);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    api<MobileDetailResult>(
      `listings/${encodeURIComponent(listingId)}/detail`,
      "GET",
      undefined,
      c.signal,
    )
      .then((value) => {
        if (!c.signal.aborted) {
          const safe = mobileListingDetail(value.listing);
          if (!safe) {
            setError("This listing is unavailable in the app.");
            return;
          }
          setData({
            ...value,
            listing: safe,
            canSave: !safe.ended && value.canSave,
            canMessage: !safe.ended && value.canMessage,
          });
          void trackAdvertising("listing_viewed", value.listing.categorySlug ?? "general");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "This listing could not be loaded.");
      });
    return () => c.abort();
  }, [listingId, attempt]);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (
        event as CustomEvent<{ listingId: string; stats: { views: number; favorites: number } }>
      ).detail;
      if (next?.listingId === listingId)
        setData((previous) => (previous ? { ...previous, stats: next.stats } : previous));
    };
    document.addEventListener("bluebird-listing-stats", update);
    return () => document.removeEventListener("bluebird-listing-stats", update);
  }, [listingId]);
  useListingActivity(data?.listing.id, learning);
  const runtime = useMemo<ListingDetailRuntime>(
    () => ({
      Link: NativeDetailLink,
      pageElement: "article",
      vehicleHistoryPurchases: false,
      ListingActions: NativeListingActions,
      ListingCard: NativeEmbeddedCard,
      PartnerHomeHeartButton: NativeDetailSave,
      PartnerJobHeartButton: NativeDetailSave,
      PartnerVehicleHeartButton: NativeDetailSave,
      WatchHeartButton: NativeDetailSave,
      VehiclePriceInsight: NativePriceInsight,
      AdminBusinessPerformanceLink: WebsiteOnlyAdministration,
      FlagListingDialog: NativeDetailFlag,
      ClaimEmployerPanel: NativeEmployerClaim,
      ClaimBusinessPanel: NativeBusinessClaim,
      stats: data?.stats ?? undefined,
      onPhoto: (photo) => trackShopping("photo", listingId, { photo }),
      onContact,
    }),
    [data?.stats, listingId],
  );
  if (error)
    return (
      <div role="alert" className="mx-4 my-6 rounded-2xl border border-border bg-card p-5 text-sm">
        {error}
        <button className="ml-3 underline" onClick={() => setAttempt((v) => v + 1)}>
          Retry listing
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="p-5 text-sm text-muted-foreground">
        Loading listing…
      </p>
    );
  return (
    <QueryClientProvider client={queryClient}>
      <Detail.Provider value={{ data, owner, learning, applicationsReady }}>
        <div onClickCapture={handleNativePublicLink}>
          {data.listing.ended && <EndedListingBanner listing={data.listing} />}
          <ListingDetailView
            listing={data.listing}
            runtime={runtime}
            handleShare={async () => {
              try {
                await Share.share({
                  title: listingDetailTitle(data.listing),
                  url: `${apiOrigin}${listingPath(data.listing)}`,
                });
              } catch (e) {
                if (!(e instanceof Error && /cancel/i.test(e.message)))
                  toast.error("This listing could not be shared.");
              }
            }}
          />
          <div className="mx-auto max-w-[1360px] px-4 pb-12 sm:px-7 lg:px-10">
            <ShoppingRows
              similarId={data.listing.id}
              learning={learning}
              revision={revision}
              onOpen={(next) => {
                location.hash = `/listings/${next}`;
              }}
            />
          </div>
          <MobileContactBarView
            aboveNavigation
            listing={data.listing}
            isSignedIn={Boolean(owner)}
            userId={owner}
            onContact={onContact}
          />
        </div>
      </Detail.Provider>
    </QueryClientProvider>
  );
}

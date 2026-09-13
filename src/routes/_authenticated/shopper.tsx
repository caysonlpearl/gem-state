import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { applyAsShopper, getShopperStatus, PARK_FREQUENCIES } from "@/lib/sourcing.functions";
import { shopperApplicationStatusLabels } from "@/lib/market-labels";
import { getShopperShippingReadiness } from "@/lib/shopper.functions";
import { ServiceProfileForm } from "@/components/shopper/ServiceProfileForm";
import { ShopperJobsDashboard } from "@/components/shopper/ShopperJobsDashboard";
import { ShopperPublicProfileForm } from "@/components/shopper/ShopperPublicProfileForm";
import { ShopperShippingForm } from "@/components/shopper/ShopperShippingForm";

export const Route = createFileRoute("/_authenticated/shopper")({
  head: () => ({
    meta: [
      { title: "In-park shopper · ParkVault" },
      {
        name: "description",
        content:
          "Apply to become an approved ParkVault in-park shopper and receive prepaid sourcing jobs for covered products.",
      },
      { property: "og:title", content: "In-park shopper · ParkVault" },
      {
        property: "og:description",
        content:
          "Approved shoppers receive prepaid sourcing jobs with disclosed earnings and purchase windows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ShopperPage,
});

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly or more",
  monthly: "Monthly",
  quarterly: "Every few months",
  annually: "About once a year",
  rarely: "Rarely",
};

function ShopperPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const fetchStatus = useServerFn(getShopperStatus);
  const fetchFacets = useServerFn(getCatalogFacets);
  const apply = useServerFn(applyAsShopper);

  useEffect(() => {
    void trackEvent("page_view", { route: "/shopper" });
  }, []);

  const fetchShippingReady = useServerFn(getShopperShippingReadiness);

  const status = useQuery({ queryKey: ["shopper-status"], queryFn: () => fetchStatus() });
  const facets = useQuery({ queryKey: ["catalog-facets"], queryFn: () => fetchFacets() });
  const isShopper = status.data?.isShopper ?? false;
  const shippingReady = useQuery({
    queryKey: ["shopper-shipping-ready"],
    queryFn: () => fetchShippingReady(),
    enabled: isShopper,
  });

  const [frequency, setFrequency] = useState<string>("monthly");
  const [homeResortId, setHomeResortId] = useState<string>("");
  const [note, setNote] = useState("");
  const [document, setDocument] = useState<File | null>(null);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Sign in required.");
      if (!document) throw new Error("Attach a photo of your government identity document.");
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
      if (!allowed.includes(document.type)) {
        throw new Error("Attach a JPEG, PNG, WebP, HEIC or PDF document.");
      }
      if (document.size > 8 * 1024 * 1024) {
        throw new Error("That file is larger than 8 MB. Attach a smaller scan or photo.");
      }
      const ext =
        document.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("shopper-documents").upload(path, document, {
        contentType: document.type || "image/jpeg",
      });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      return apply({
        data: {
          parkFrequency: frequency,
          idDocumentPath: path,
          homeResortId: homeResortId || null,
          applicantNote: note || null,
        },
      });
    },
    onSuccess: async () => {
      await trackEvent("shopper_application_submitted", { frequency });
      await queryClient.invalidateQueries({ queryKey: ["shopper-status"] });
      setNote("");
      setDocument(null);
      toast.success("Application submitted for manual review.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not apply."),
  });

  const application = status.data?.application ?? null;

  return (
    <div className="mx-auto max-w-[980px] px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">In-park shopper</h1>
      <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-muted-foreground">
        Approved shoppers choose $10–$25 in earnings per item for members who cannot visit the
        parks. Buyers see your earnings and ParkVault&apos;s separate sourcing and protection fee
        before paying. ParkVault does not deduct from your selected earnings.{" "}
        <Link to="/glossary" className="underline underline-offset-2">
          Read the plain-language guide
        </Link>
        .
      </p>

      {status.isLoading && <p className="mt-6 text-[13px] text-muted-foreground">Loading…</p>}

      {!status.isLoading && (
        <section className="mt-8 rounded-lg border border-border bg-card">
          <div className="hairline-b px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-tight">Your shopper status</h2>
          </div>
          <div className="px-4 py-3 text-[12.5px]">
            {isShopper ? (
              <>
                <p className="font-medium">Approved shopper</p>
                <p className="mt-1 text-muted-foreground">
                  Open any product, choose the exact variation, then post a fixed-price sourcing
                  offer with the window you can commit to. Or respond to buyers&apos; custom
                  sourcing requests below with your own quote. Either way, there is no negotiation
                  and no direct messaging. Once a buyer chooses you, the job shows up in{" "}
                  <span className="font-medium text-foreground">Your shopping jobs</span> below.
                </p>
              </>
            ) : application ? (
              <>
                <p className="font-medium">
                  {shopperApplicationStatusLabels[application.status] ?? application.status}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Applications are reviewed manually. Your identity document is stored privately and
                  is never shown to other members.
                </p>
                {application.decisionNote && (
                  <p className="mt-1 text-muted-foreground">
                    Reviewer note: {application.decisionNote}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">You have not applied yet.</p>
            )}
          </div>
        </section>
      )}

      {!status.isLoading && isShopper && (
        <>
          {!shippingReady.isLoading && shippingReady.data && !shippingReady.data.ready && (
            <p
              role="status"
              className="mt-8 rounded-lg border border-border bg-secondary px-4 py-3 text-[12.5px]"
            >
              Add your ship-from address in your shipping setup below. Buyers can only choose you
              once ParkVault can price delivery from where you ship.
            </p>
          )}

          <div className="mt-8">{userId ? <ShopperJobsDashboard userId={userId} /> : null}</div>

          <ShopperPublicProfileForm />
          <ShopperShippingForm />
          <ServiceProfileForm />
        </>
      )}

      {!status.isLoading &&
        !isShopper &&
        (application === null || application.status === "rejected") && (
          <section className="mt-6 rounded-lg border border-border bg-card">
            <div className="hairline-b px-4 py-3">
              <h2 className="text-[13px] font-semibold tracking-tight">Apply to shop in park</h2>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="frequency" className="text-[12px] font-medium">
                    How often are you in the parks?
                  </label>
                  <select
                    id="frequency"
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {PARK_FREQUENCIES.map((value) => (
                      <option key={value} value={value}>
                        {frequencyLabels[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="home-resort" className="text-[12px] font-medium">
                    Home resort (optional)
                  </label>
                  <select
                    id="home-resort"
                    value={homeResortId}
                    onChange={(event) => setHomeResortId(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not specified</option>
                    {(facets.data?.geography ?? []).map((resort) => (
                      <option key={resort.resortId} value={resort.resortId}>
                        {resort.resortName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="id-document" className="text-[12px] font-medium">
                  Government identity document (required, stored privately)
                </label>
                <input
                  id="id-document"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setDocument(event.target.files?.[0] ?? null)}
                  className="mt-1.5 block text-[12.5px]"
                />
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                  It is stored in a private bucket. You can re-open your own upload while signed in,
                  and a reviewer can open it for verification through an audited internal channel.
                  No other member can reach it, it is never public, and it never becomes catalog
                  imagery.
                </p>
              </div>

              <div>
                <label htmlFor="applicant-note" className="text-[12px] font-medium">
                  Anything we should know (optional)
                </label>
                <textarea
                  id="applicant-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 500))}
                  rows={3}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="h-10 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {applyMutation.isPending ? "Submitting…" : "Submit application"}
              </button>
            </div>
          </section>
        )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SellerSetupView, type StartListingLinkProps } from "@/components/seller/SellerSetupView";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { supabase } from "@/integrations/supabase/client";
import { getSellerSetup, saveSellerSetup } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller-setup")({
  component: SellerSetupPage,
});

function SellerSetupPage() {
  const queryClient = useQueryClient();
  const fetchSetup = useServerFn(getSellerSetup);
  const save = useServerFn(saveSellerSetup);
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (!setup.data || draft) return;
    setDraft({
      displayName: setup.data.displayName,
      avatarUrl: setup.data.avatarUrl,
      slug: setup.data.slug,
      bio: setup.data.bio,
      shipFromName: setup.data.shipFromName,
      shipFromPhone: setup.data.shipFromPhone,
      shipFromLine1: setup.data.shipFromLine1,
      shipFromLine2: setup.data.shipFromLine2,
      shipFromCity: setup.data.shipFromCity,
      shipFromRegion: setup.data.shipFromRegion,
      shipFromPostalCode: setup.data.shipFromPostalCode,
      shipFromCountry: setup.data.shipFromCountry,
      defaultShippingMethod: setup.data.defaultShippingMethod,
      defaultHandlingDays: String(setup.data.defaultHandlingDays ?? ""),
      acceptTerms: setup.data.termsAccepted,
    });
  }, [setup.data, draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let avatarUrl = String(draft?.["avatarUrl"] ?? "");
      if (avatarFile) {
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        const ext =
          avatarFile.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${uid}/profile.${ext}`;
        const uploaded = await supabase.storage.from("seller-avatars").upload(path, avatarFile, {
          contentType: avatarFile.type || "image/jpeg",
          upsert: true,
        });
        if (uploaded.error)
          throw new Error(`Profile photo upload failed: ${uploaded.error.message}`);
        avatarUrl = supabase.storage.from("seller-avatars").getPublicUrl(path).data.publicUrl;
      }
      return save({
        data: {
          displayName: String(draft?.["displayName"] ?? ""),
          avatarUrl,
          slug: String(draft?.["slug"] ?? ""),
          bio: String(draft?.["bio"] ?? ""),
          shipFromName: String(draft?.["shipFromName"] ?? ""),
          shipFromPhone: String(draft?.["shipFromPhone"] ?? ""),
          shipFromLine1: String(draft?.["shipFromLine1"] ?? ""),
          shipFromLine2: String(draft?.["shipFromLine2"] ?? ""),
          shipFromCity: String(draft?.["shipFromCity"] ?? ""),
          shipFromRegion: String(draft?.["shipFromRegion"] ?? ""),
          shipFromPostalCode: String(draft?.["shipFromPostalCode"] ?? ""),
          shipFromCountry: String(draft?.["shipFromCountry"] ?? "US"),
          defaultShippingMethod: String(draft?.["defaultShippingMethod"] ?? ""),
          defaultHandlingDays: Number(draft?.["defaultHandlingDays"] ?? 0),
          acceptTerms: Boolean(draft?.["acceptTerms"]),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seller-setup"] });
      setAvatarFile(null);
      toast.success("Seller profile saved. You can now create listings.");
      document.getElementById("first-listing")?.scrollIntoView({ behavior: "smooth" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save seller setup."),
  });

  const set = (key: string, value: string | boolean) =>
    setDraft((current) => ({ ...(current ?? {}), [key]: value }));
  // Direct-contact classifieds do not require payment, payout, or shipping-method
  // onboarding -- buyer and seller arrange all of that themselves. Only the seller
  // agreement is required to start listing.
  const profileReady = Boolean(setup.data?.exists && setup.data?.termsAccepted);
  const sellerReady = profileReady;

  return (
    <SellerSetupView
      draft={draft}
      avatarFile={avatarFile}
      setAvatarFile={setAvatarFile}
      set={set}
      saveMutation={saveMutation}
      exists={setup.data?.exists === true}
      profileReady={profileReady}
      sellerReady={sellerReady}
      navigation={<SellerCenterNav storefrontSlug={setup.data?.slug} />}
      renderStartLink={WebsiteStartListingLink}
    />
  );
}
function WebsiteStartListingLink({ className, children }: StartListingLinkProps) {
  return (
    <Link to="/create-listing" className={className}>
      {children}
    </Link>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- new migration types */
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canonicalSellerSourceProfile } from "./seller-claims";

export const claimHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function ensureManagedImportSeller(
  profile: string,
  name: string,
  actor: string,
  existingOnly = false,
) {
  const admin = supabaseAdmin as any;
  const canonical = canonicalSellerSourceProfile(profile);
  const { data: present, error: readError } = await admin
    .from("managed_import_sellers")
    .select("*")
    .eq("source_profile_url", canonical)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (present) return present;
  const { data: items, error: itemError } = await admin
    .from("fb_marketplace_import_items")
    .select("seller_id")
    .eq("source_profile_url", canonical)
    .not("seller_id", "is", null)
    .limit(1);
  if (itemError) throw new Error(itemError.message);
  let candidate = items?.[0]?.seller_id;
  let created = false;
  if (!candidate) {
    if (existingOnly)
      throw new Error("This seller is not linked yet. Choose Publish and create claim link.");
    const { data, error } = await admin.auth.admin.createUser({
      email: `managed-${randomBytes(16).toString("hex")}@import.invalid`,
      email_confirm: false,
      ban_duration: "876000h",
      app_metadata: { managed_import: true },
      user_metadata: { display_name: name },
    });
    if (error || !data.user)
      throw new Error(error?.message ?? "Could not prepare a managed seller.");
    candidate = data.user.id;
    created = true;
    const nameSlug =
      name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 18)
        .replace(/-$/g, "") || "seller";
    // Public storefront handles must not encode the provisional account ID.
    const slug = `${nameSlug}-${randomBytes(5).toString("hex")}`;
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: candidate, display_name: name }, { onConflict: "id" });
    const { error: sellerError } = await admin
      .from("seller_profiles")
      .insert({ user_id: candidate, slug, status: "active" });
    if (profileError || sellerError) throw new Error(profileError?.message ?? sellerError?.message);
  }
  const { data: seller, error } = await admin.rpc("register_managed_import_seller", {
    _profile: canonical,
    _name: name,
    _candidate: candidate,
    _actor: actor,
  });
  if (error) throw new Error(error.message);
  // A racing setup may have won. Only dispose of the unused locked identity.
  if (created && seller.owner_user_id !== candidate) await admin.auth.admin.deleteUser(candidate);
  return seller;
}
export async function issueSellerClaimLink(sellerId: string, actor: string) {
  const token = randomBytes(32).toString("hex");
  const { data, error } = await (supabaseAdmin as any).rpc("rotate_seller_claim", {
    _seller: sellerId,
    _hash: claimHash(token),
    _actor: actor,
    _revoke: false,
  });
  if (error) throw new Error(error.message);
  return { url: `https://onbluebird.com/claim-seller#token=${token}`, expiresAt: data as string };
}

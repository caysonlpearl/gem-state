/* eslint-disable @typescript-eslint/no-explicit-any -- newly added migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalSellerSourceProfile, validClaimToken, claimLinkStatus } from "./seller-claims";

async function operator(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Administrator access required.");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
const secretInput = (input: { token: string }) => ({ token: validClaimToken(input.token) });

export const inspectSellerClaim = createServerFn({ method: "POST" })
  .validator(secretInput)
  .handler(async ({ data }) => {
    const db = await admin();
    const { claimHash } = await import("./seller-claims.server");
    const { data: token, error } = await db
      .from("seller_claim_tokens")
      .select("managed_seller_id,expires_at,revoked_at,consumed_at")
      .eq("token_hash", claimHash(data.token))
      .maybeSingle();
    if (error) throw new Error("The claim page is temporarily unavailable. Try again.");
    if (!token)
      return {
        status: "Invalid",
        sellerName: "",
        count: 0,
        pendingCount: 0,
        previews: [] as { title: string; imageUrl: string | null }[],
        existingAccount: false,
      };
    const { data: seller } = await db
      .from("managed_import_sellers")
      .select("display_name,source_profile_url,claimed_at,required_claimant_id")
      .eq("id", token.managed_seller_id)
      .single();
    const status = claimLinkStatus(token, Boolean(seller?.claimed_at));
    if (status !== "Unclaimed")
      return {
        status,
        sellerName: seller?.display_name ?? "",
        count: 0,
        pendingCount: 0,
        previews: [] as { title: string; imageUrl: string | null }[],
        existingAccount: Boolean(seller?.required_claimant_id),
      };
    const { data: items, error: itemError } = await db
      .from("fb_marketplace_import_items")
      .select("title,evidence_paths,listing_id")
      .eq("source_profile_url", seller.source_profile_url)
      .neq("status", "discarded");
    if (itemError) throw new Error("Could not load your listings. Try again.");
    const previews = await Promise.all(
      (items ?? []).slice(0, 3).map(async (i: any) => {
        const path = i.evidence_paths?.[0];
        const signed = path
          ? await db.storage.from("ask-evidence").createSignedUrl(path, 600)
          : null;
        return { title: i.title as string, imageUrl: signed?.data?.signedUrl ?? null };
      }),
    );
    return {
      status,
      sellerName: seller.display_name as string,
      count: items?.length ?? 0,
      pendingCount: (items ?? []).filter((i: any) => !i.listing_id).length,
      previews,
      existingAccount: Boolean(seller.required_claimant_id),
    };
  });

export const completeSellerClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string; acceptTerms: boolean; syncEnabled: boolean }) => {
    if (input.acceptTerms !== true)
      throw new Error("Accept the seller agreement to claim your listings.");
    return { ...secretInput(input), acceptTerms: true, syncEnabled: true };
  })
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { claimHash } = await import("./seller-claims.server");
    const { data: prepared, error } = await db.rpc("prepare_seller_claim", {
      _hash: claimHash(data.token),
      _claimant: context.userId,
    });
    if (error) throw new Error(error.message);
    if (prepared.complete) return { ok: true };
    // Deterministic destinations make retries safe. Never overwrite an unrelated object.
    for (const asset of prepared.manifest as { bucket: string; old: string; new: string }[]) {
      const existing = await db.storage.from(asset.bucket).info(asset.new);
      if (existing.error) {
        const { error: copyError } = await db.storage.from(asset.bucket).copy(asset.old, asset.new);
        if (copyError && !/already exists|duplicate/i.test(copyError.message))
          throw new Error(
            "A photo could not be transferred. Your listings are unchanged; retry claiming.",
          );
      }
    }
    const { error: finishError } = await db.rpc("finish_seller_claim", {
      _transfer: prepared.transferId,
      _claimant: context.userId,
      _accept_terms: data.acceptTerms,
      _sync: data.syncEnabled,
    });
    if (finishError) throw new Error(finishError.message);
    return { ok: true };
  });

export const createSellerClaimLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { profile: string; displayName: string; authorized: boolean }) => {
    if (input.authorized !== true) throw new Error("Confirm the seller authorized this import.");
    return {
      profile: canonicalSellerSourceProfile(input.profile),
      displayName:
        String(input.displayName ?? "Seller")
          .trim()
          .slice(0, 120) || "Seller",
    };
  })
  .handler(async ({ data, context }) => {
    await operator(context);
    const { ensureManagedImportSeller, issueSellerClaimLink } =
      await import("./seller-claims.server");
    const seller = await ensureManagedImportSeller(data.profile, data.displayName, context.userId);
    return issueSellerClaimLink(seller.id, context.userId);
  });
export const revokeSellerClaimLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sellerId: string }) => ({ sellerId: String(input.sellerId) }))
  .handler(async ({ data, context }) => {
    await operator(context);
    const { error } = await (
      await admin()
    ).rpc("rotate_seller_claim", {
      _seller: data.sellerId,
      _actor: context.userId,
      _hash: "",
      _revoke: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getManagedImportSellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await operator(context);
    const db = await admin();
    const { data, error } = await db
      .from("managed_import_sellers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: tokens, error: tokenError } = await db
      .from("seller_claim_tokens")
      .select("managed_seller_id,expires_at,revoked_at,consumed_at,created_at")
      .order("created_at", { ascending: false });
    if (tokenError) throw new Error(tokenError.message);
    const { data: audits } = await db
      .from("import_seller_audit")
      .select("managed_seller_id,actor_id,action,target_id,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []).map((s: any) => ({
      id: s.id as string,
      profile: s.source_profile_url as string,
      name: s.display_name as string,
      status: claimLinkStatus(
        (tokens ?? []).find((t: any) => t.managed_seller_id === s.id) ?? null,
        Boolean(s.claimed_at),
      ),
      syncEnabled: s.sync_enabled as boolean,
      expiresAt: (tokens ?? []).find((t: any) => t.managed_seller_id === s.id)?.expires_at as
        string | undefined,
      audit: (audits ?? []).filter((a: any) => a.managed_seller_id === s.id).slice(0, 10),
    }));
  });
export const getMyImportSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data, error } = await db
      .from("managed_import_sellers")
      .select("id,display_name,source_profile_url,sync_enabled")
      .eq("owner_user_id", context.userId)
      .not("claimed_at", "is", null);
    if (error) throw new Error(error.message);
    const sellers = data as {
      id: string;
      display_name: string;
      source_profile_url: string;
      sync_enabled: boolean;
    }[];
    return Promise.all(
      sellers.map(async (seller) => {
        const { data: items, error: itemError } = await db
          .from("fb_marketplace_import_items")
          .select("id,title,public_paths")
          .eq("source_profile_url", seller.source_profile_url)
          .eq("seller_id", context.userId)
          .is("listing_id", null)
          .neq("status", "discarded");
        if (itemError) throw new Error("Could not load your pending imports. Try again.");
        const pendingListings = await Promise.all(
          (items ?? []).map(async (item: any) => {
            const path = item.public_paths?.[0];
            const signed = path
              ? await db.storage.from("listing-media").createSignedUrl(path, 600)
              : null;
            return {
              id: String(item.id),
              title: String(item.title),
              imageUrl: signed?.data?.signedUrl as string | undefined,
            };
          }),
        );
        return { ...seller, pendingListings };
      }),
    );
  });
export const updateMyImportSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sellerId: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (
      await admin()
    ).rpc("set_import_sync", {
      _seller: data.sellerId,
      _user: context.userId,
      _enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getManagedInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await operator(context);
    const db = await admin();
    const { data: sellers, error: sellerError } = await db
      .from("managed_import_sellers")
      .select("id,owner_user_id,display_name,source_profile_url")
      .is("claimed_at", null);
    if (sellerError) throw new Error(sellerError.message);
    if (!sellers?.length) return [];
    const { data: items } = await db
      .from("fb_marketplace_import_items")
      .select("listing_id,source_profile_url")
      .in(
        "source_profile_url",
        sellers.map((s: any) => s.source_profile_url),
      )
      .not("listing_id", "is", null);
    if (!items?.length) return [];
    const { data: threads, error } = await db
      .from("conversations")
      .select(
        "id,listing_id,last_message_at,asks(products(name)),conversation_messages(id,sender_id,body,sender_label,attachment_path,created_at)",
      )
      .in(
        "listing_id",
        items.map((i: any) => i.listing_id),
      )
      .in(
        "seller_id",
        sellers.map((s: any) => s.owner_user_id),
      )
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const { data: inquiries } = await db
      .from("listing_inquiries")
      .select("id,listing_id,buyer_name,message,created_at,status")
      .neq("status", "closed")
      .in(
        "listing_id",
        items.map((i: any) => i.listing_id),
      )
      .in(
        "seller_id",
        sellers.map((s: any) => s.owner_user_id),
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const results = await Promise.all(
      (threads ?? []).map(async (t: any) => {
        const profile = items.find((i: any) => i.listing_id === t.listing_id)?.source_profile_url;
        const s = sellers.find((s: any) => s.source_profile_url === profile);
        const messages = await Promise.all(
          (t.conversation_messages ?? [])
            .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
            .map(async (m: any) => {
              const signed = m.attachment_path
                ? await db.storage
                    .from("conversation-attachments")
                    .createSignedUrl(m.attachment_path, 600)
                : null;
              return {
                id: m.id,
                body: m.body,
                label:
                  m.sender_label ?? (m.sender_id === s.owner_user_id ? s.display_name : "Buyer"),
                createdAt: m.created_at,
                attachmentUrl: signed?.data?.signedUrl ?? null,
              };
            }),
        );
        return {
          id: t.id as string,
          title: t.asks?.products?.name ?? "Listing",
          sellerName: s.display_name as string,
          messages,
          legacy: false,
        };
      }),
    );
    for (const i of inquiries ?? []) {
      const profile = items.find((x: any) => x.listing_id === i.listing_id)?.source_profile_url;
      const s = sellers.find((x: any) => x.source_profile_url === profile);
      results.push({
        id: i.id,
        title: "Listing inquiry",
        sellerName: s.display_name,
        messages: [
          {
            id: i.id,
            body: i.message,
            label: i.buyer_name,
            createdAt: i.created_at,
            attachmentUrl: null,
          },
        ],
        legacy: true,
      });
    }
    return results;
  });
export const replyManagedConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; body: string }) => ({
    conversationId: String(input.conversationId),
    body: String(input.body).trim(),
  }))
  .handler(async ({ data, context }) => {
    await operator(context);
    const { data: messageId, error } = await (
      await admin()
    ).rpc("reply_managed_import_conversation", {
      _conversation: data.conversationId,
      _actor: context.userId,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    const { emailMarketplaceMessage } = await import("./email-notifications.server");
    await emailMarketplaceMessage(data.conversationId, context.userId, messageId);
    return { ok: true };
  });
export const keepBluebirdImportVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { itemId: string }) => ({ itemId: String(input.itemId) }))
  .handler(async ({ data, context }) => {
    await operator(context);
    const { error } = await (
      await admin()
    ).rpc("keep_bluebird_import_version", { _item: data.itemId, _actor: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const replyManagedInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { inquiryId: string; body: string }) => ({
    inquiryId: String(input.inquiryId),
    body: String(input.body).trim(),
  }))
  .handler(async ({ data, context }) => {
    await operator(context);
    const { data: conversationId, error } = await (
      await admin()
    ).rpc("reply_managed_import_inquiry", {
      _inquiry: data.inquiryId,
      _actor: context.userId,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { conversationId: conversationId as string };
  });

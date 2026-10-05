/* eslint-disable @typescript-eslint/no-explicit-any -- listing_inquiries is added by the next linked migration/type generation */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ListingInquiry = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerName: string;
  buyerEmail: string;
  message: string;
  status: "new" | "read" | "closed";
  createdAt: string;
  source: "listing_inquiry" | "conversation";
  conversationId?: string;
};

function cleanMessage(value: unknown) {
  const message = String(value ?? "").trim();
  if (message.length < 10) throw new Error("Tell the seller a little more.");
  if (message.length > 2000) throw new Error("Your message is too long.");
  return message;
}

export const sendClassifiedListingInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; message: string }) => ({
    listingId: String(input.listingId),
    message: cleanMessage(input.message),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; inquiryId: string }> => {
    const client = context.supabase as any;
    const { data: inquiryId, error } = await client.rpc("create_listing_inquiry", {
      _listing_id: data.listingId,
      _message: data.message,
    });
    if (error || !inquiryId)
      throw new Error(error?.message ?? "We could not send your message. Please try again.");

    const { emailListingInquiry } = await import("./email-notifications.server");
    await emailListingInquiry(inquiryId);

    return { ok: true, inquiryId: inquiryId as string };
  });

export const getSellerListingInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListingInquiry[]> => {
    const client = context.supabase as any;
    const { data: rows, error } = await client
      .from("listing_inquiries")
      .select("id,listing_id,buyer_name,buyer_email,message,status,created_at,asks(products(name))")
      .eq("seller_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const { data: conversations, error: conversationError } = await client
      .from("conversations")
      .select(
        "id,listing_id,buyer_id,last_message_at,created_at,asks(products(name)),conversation_messages(body,created_at)",
      )
      .eq("seller_id", context.userId)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (conversationError) throw new Error(conversationError.message);
    const buyerIds = [
      ...new Set((conversations ?? []).map((row: any) => row.buyer_id).filter(Boolean)),
    ];
    const { data: profiles } = buyerIds.length
      ? await client.from("public_profile_display").select("id,display_name").in("id", buyerIds)
      : { data: [] as any[] };
    const names = new Map(
      (profiles ?? []).map((profile: any) => [profile.id, profile.display_name]),
    );
    const legacy = (rows ?? []).map((row: any) => ({
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.asks?.products?.name ?? "Your listing",
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      source: "listing_inquiry" as const,
    }));
    const marketplace = (conversations ?? []).map((row: any) => {
      const messages = [...(row.conversation_messages ?? [])].sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      return {
        id: row.id,
        listingId: row.listing_id,
        listingTitle: row.asks?.products?.name ?? "Marketplace conversation",
        buyerName: names.get(row.buyer_id) ?? "Bluebird member",
        buyerEmail: "",
        message: messages.at(-1)?.body ?? "Marketplace conversation",
        status: "new" as const,
        createdAt: row.last_message_at ?? row.created_at,
        source: "conversation" as const,
        conversationId: row.id,
      };
    });
    return [...legacy, ...marketplace].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });

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

    return (rows ?? []).map((row: any) => ({
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.asks?.products?.name ?? "Your listing",
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    }));
  });

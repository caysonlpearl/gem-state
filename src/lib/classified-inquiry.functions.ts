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
  .inputValidator((input: { listingId: string; message: string }) => ({
    listingId: String(input.listingId),
    message: cleanMessage(input.message),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; inquiryId: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: listing, error: listingError } = await admin
      .from("asks")
      .select("id,seller_id,status,approved_at,expires_at,products(name)")
      .eq("id", data.listingId)
      .eq("status", "active")
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (listingError || !listing?.seller_id) throw new Error("That listing is no longer available.");
    if (listing.seller_id === context.userId) throw new Error("You cannot contact yourself.");

    const email = String(context.claims?.email ?? "").trim();
    if (!email) throw new Error("Your account needs an email address before you can contact a seller.");

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    const buyerName = String(profile?.display_name ?? email.split("@")[0] ?? "Gem State buyer").trim();

    const { data: inquiry, error } = await admin
      .from("listing_inquiries")
      .insert({
        listing_id: data.listingId,
        seller_id: listing.seller_id,
        buyer_id: context.userId,
        buyer_name: buyerName || "Gem State buyer",
        buyer_email: email,
        message: data.message,
      })
      .select("id")
      .single();
    if (error || !inquiry) throw new Error("We could not send your message. Please try again.");

    return { ok: true, inquiryId: inquiry.id };
  });

export const getSellerListingInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListingInquiry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: rows, error } = await admin
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

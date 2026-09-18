/* eslint-disable @typescript-eslint/no-explicit-any -- conversation tables are added by the linked migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConversationSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  memberRole: "buyer" | "seller";
  otherMemberId: string;
  lastMessageAt: string;
  lastReadAt: string | null;
  unread: boolean;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachmentPath: string | null;
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[];
};

function summary(row: any, userId: string): ConversationSummary {
  const participant = (row.conversation_participants ?? []).find((item: any) => item.user_id === userId);
  const listingTitle = row.asks?.products?.name ?? "Marketplace conversation";
  const otherMemberId = row.buyer_id === userId ? row.seller_id : row.buyer_id;
  return {
    id: row.id,
    listingId: row.listing_id ?? null,
    listingTitle,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    memberRole: row.buyer_id === userId ? "buyer" : "seller",
    otherMemberId,
    lastMessageAt: row.last_message_at,
    lastReadAt: participant?.last_read_at ?? null,
    unread: Boolean(row.last_message_at && (!participant?.last_read_at || row.last_message_at > participant.last_read_at)),
    createdAt: row.created_at,
  };
}

export const getMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("conversations")
      .select("id,listing_id,buyer_id,seller_id,last_message_at,created_at,asks(products(name)),conversation_participants(user_id,last_read_at)")
      .or(`buyer_id.eq.${context.userId},seller_id.eq.${context.userId}`)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => summary(row, context.userId));
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }): Promise<ConversationDetail> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("conversations")
      .select("id,listing_id,buyer_id,seller_id,last_message_at,created_at,asks(products(name)),conversation_participants(user_id,last_read_at)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Conversation not found.");
    const { data: messages, error: messageError } = await client
      .from("conversation_messages")
      .select("id,conversation_id,sender_id,body,attachment_path,created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (messageError) throw new Error(messageError.message);
    return {
      ...summary(row, context.userId),
      messages: (messages ?? []).map((message: any) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        attachmentPath: message.attachment_path ?? null,
        createdAt: message.created_at,
      })),
    };
  });

function cleanBody(value: unknown) {
  const body = String(value ?? "").trim();
  if (body.length < 1 || body.length > 5000) throw new Error("Message must be between 1 and 5000 characters.");
  return body;
}

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listingId: string; body: string }) => ({
    listingId: String(input.listingId),
    body: cleanBody(input.body),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { data: conversationId, error } = await (context.supabase as any).rpc("start_conversation", {
      _listing_id: data.listingId,
      _body: data.body,
    });
    if (error || !conversationId) throw new Error(error?.message ?? "We could not start this conversation.");
    return { conversationId: conversationId as string };
  });

export const sendConversationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; body: string }) => ({
    conversationId: String(input.conversationId),
    body: cleanBody(input.body),
  }))
  .handler(async ({ data, context }) => {
    const { data: messageId, error } = await (context.supabase as any).rpc("send_conversation_message", {
      _conversation_id: data.conversationId,
      _body: data.body,
    });
    if (error || !messageId) throw new Error(error?.message ?? "We could not send your message.");
    return { messageId: messageId as string };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({ conversationId: String(input.conversationId) }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("mark_conversation_read", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const blockConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({ conversationId: String(input.conversationId) }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("block_conversation", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reportConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; reason: string }) => {
    const reason = String(input.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 500) throw new Error("Tell us why you are reporting this conversation.");
    return { conversationId: String(input.conversationId), reason };
  })
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.from("conversation_reports").insert({
      conversation_id: data.conversationId,
      reporter_id: context.userId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

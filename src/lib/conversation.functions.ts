/* eslint-disable @typescript-eslint/no-explicit-any -- conversation tables are added by the linked migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailMarketplaceMessage } from "./email-notifications.server";

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
  attachmentContentType: string | null;
  attachmentSize: number | null;
  attachmentUrl: string | null;
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[];
};

function summary(row: any, userId: string): ConversationSummary {
  const participant = (row.conversation_participants ?? []).find(
    (item: any) => item.user_id === userId,
  );
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
    unread: Boolean(
      row.last_message_at &&
      (!participant?.last_read_at || row.last_message_at > participant.last_read_at),
    ),
    createdAt: row.created_at,
  };
}

export const getMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("conversations")
      .select(
        "id,listing_id,buyer_id,seller_id,last_message_at,created_at,asks(products(name)),conversation_participants(user_id,last_read_at)",
      )
      .or(`buyer_id.eq.${context.userId},seller_id.eq.${context.userId}`)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => summary(row, context.userId));
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }): Promise<ConversationDetail> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("conversations")
      .select(
        "id,listing_id,buyer_id,seller_id,last_message_at,created_at,asks(products(name)),conversation_participants(user_id,last_read_at)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Conversation not found.");
    const { data: messages, error: messageError } = await client
      .from("conversation_messages")
      .select(
        "id,conversation_id,sender_id,body,attachment_path,attachment_content_type,attachment_size,created_at",
      )
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (messageError) throw new Error(messageError.message);
    const attachmentPaths = (messages ?? [])
      .map((message: any) => message.attachment_path)
      .filter((path: unknown): path is string => typeof path === "string" && path.length > 0);
    const attachmentUrls = new Map<string, string>();
    if (attachmentPaths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signedUrls } = await supabaseAdmin.storage
        .from("conversation-attachments")
        .createSignedUrls(attachmentPaths, 60 * 60);
      for (const signedUrl of signedUrls ?? []) {
        if (signedUrl.path && signedUrl.signedUrl)
          attachmentUrls.set(signedUrl.path, signedUrl.signedUrl);
      }
    }
    return {
      ...summary(row, context.userId),
      messages: (messages ?? []).map((message: any) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        attachmentPath: message.attachment_path ?? null,
        attachmentContentType: message.attachment_content_type ?? null,
        attachmentSize: message.attachment_size ?? null,
        attachmentUrl: message.attachment_path
          ? (attachmentUrls.get(message.attachment_path) ?? null)
          : null,
        createdAt: message.created_at,
      })),
    };
  });

function cleanBody(value: unknown) {
  const body = String(value ?? "").trim();
  if (body.length < 1 || body.length > 5000)
    throw new Error("Message must be between 1 and 5000 characters.");
  return body;
}

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; body: string }) => ({
    listingId: String(input.listingId),
    body: cleanBody(input.body),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { data: conversationId, error } = await (context.supabase as any).rpc(
      "start_conversation",
      {
        _listing_id: data.listingId,
        _body: data.body,
      },
    );
    if (error || !conversationId)
      throw new Error(error?.message ?? "We could not start this conversation.");
    await emailMarketplaceMessage(conversationId as string, context.userId);
    return { conversationId: conversationId as string };
  });

export const sendConversationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; body: string }) => ({
    conversationId: String(input.conversationId),
    body: cleanBody(input.body),
  }))
  .handler(async ({ data, context }) => {
    const { data: messageId, error } = await (context.supabase as any).rpc(
      "send_conversation_message",
      {
        _conversation_id: data.conversationId,
        _body: data.body,
      },
    );
    if (error || !messageId) throw new Error(error?.message ?? "We could not send your message.");
    await emailMarketplaceMessage(data.conversationId, context.userId, messageId as string);
    return { messageId: messageId as string };
  });

const attachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const attachmentExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const createConversationAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { conversationId: string; fileName: string; contentType: string; size: number }) => {
      const contentType = String(input.contentType ?? "");
      const size = Number(input.size ?? 0);
      if (!attachmentTypes.has(contentType))
        throw new Error("Use a JPG, PNG, WebP, or PDF attachment.");
      if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024)
        throw new Error("Attachments must be 10 MB or smaller.");
      return {
        conversationId: String(input.conversationId),
        fileName: String(input.fileName ?? "attachment"),
        contentType,
        size,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: participant, error } = await (context.supabase as any)
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .is("blocked_at", null)
      .maybeSingle();
    if (error || !participant)
      throw new Error(error?.message ?? "You are not a participant in this conversation.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/${data.conversationId}/${crypto.randomUUID()}.${attachmentExtensions[data.contentType]}`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from("conversation-attachments")
      .createSignedUploadUrl(path);
    if (uploadError || !upload?.token)
      throw new Error(uploadError?.message ?? "Could not prepare the attachment upload.");
    return { path, token: upload.token, contentType: data.contentType, size: data.size };
  });

export const sendConversationMessageWithAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      conversationId: string;
      body: string;
      attachmentPath: string;
      attachmentContentType: string;
      attachmentSize: number;
    }) => {
      const contentType = String(input.attachmentContentType ?? "");
      const size = Number(input.attachmentSize ?? 0);
      if (!attachmentTypes.has(contentType)) throw new Error("Attachment type is not allowed.");
      if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024)
        throw new Error("Attachments must be 10 MB or smaller.");
      return {
        conversationId: String(input.conversationId),
        body: cleanBody(input.body),
        attachmentPath: String(input.attachmentPath),
        attachmentContentType: contentType,
        attachmentSize: size,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: messageId, error } = await (context.supabase as any).rpc(
      "send_conversation_message_with_attachment",
      {
        _conversation_id: data.conversationId,
        _body: data.body,
        _attachment_path: data.attachmentPath,
        _attachment_content_type: data.attachmentContentType,
        _attachment_size: data.attachmentSize,
      },
    );
    if (error || !messageId) throw new Error(error?.message ?? "We could not send your message.");
    await emailMarketplaceMessage(data.conversationId, context.userId, messageId as string);
    return { messageId: messageId as string };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => ({
    conversationId: String(input.conversationId),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("mark_conversation_read", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const blockConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => ({
    conversationId: String(input.conversationId),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("block_conversation", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reportConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; reason: string }) => {
    const reason = String(input.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 500)
      throw new Error("Tell us why you are reporting this conversation.");
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

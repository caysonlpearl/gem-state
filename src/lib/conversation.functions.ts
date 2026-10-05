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
  otherMemberName: string;
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

function summary(
  row: any,
  userId: string,
  otherMemberNames: Map<string, string> = new Map(),
): ConversationSummary {
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
    otherMemberName: otherMemberNames.get(otherMemberId) ?? "Bluebird member",
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
    const otherMemberIds = [
      ...new Set(
        (data ?? []).map((row: any) =>
          row.buyer_id === context.userId ? row.seller_id : row.buyer_id,
        ),
      ),
    ];
    const { data: profiles } = otherMemberIds.length
      ? await client
          .from("public_profile_display")
          .select("id,display_name")
          .in("id", otherMemberIds)
      : { data: [] as any[] };
    const names = new Map<string, string>(
      (profiles ?? []).map((profile: any) => [
        profile.id,
        String(profile.display_name ?? "").trim() || "Bluebird member",
      ]),
    );
    return (data ?? []).map((row: any) => summary(row, context.userId, names));
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
    const otherMemberId = row.buyer_id === context.userId ? row.seller_id : row.buyer_id;
    const { data: otherProfile } = await client
      .from("public_profile_display")
      .select("display_name")
      .eq("id", otherMemberId)
      .maybeSingle();
    const otherMemberNames = new Map<string, string>([
      [otherMemberId, String(otherProfile?.display_name ?? "").trim() || "Bluebird member"],
    ]);
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
      ...summary(row, context.userId, otherMemberNames),
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
    const { error } = await client.rpc("report_conversation", {
      _conversation_id: data.conversationId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type AdminConversationReport = {
  id: string;
  conversationId: string;
  listingId: string | null;
  listingTitle: string;
  reporterName: string;
  buyerName: string;
  sellerName: string;
  reason: string;
  status: string;
  adminNote: string | null;
  assignedTo: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Administrator access required.");
}

export const getAdminConversationReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminConversationReport[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: reports, error } = await admin
      .from("conversation_reports")
      .select(
        "id,conversation_id,reporter_id,reason,status,admin_note,assigned_to,created_at,resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const conversationIds = [...new Set((reports ?? []).map((row: any) => row.conversation_id))];
    const { data: conversations, error: conversationError } = conversationIds.length
      ? await admin
          .from("conversations")
          .select("id,listing_id,buyer_id,seller_id,asks(products(name))")
          .in("id", conversationIds)
      : { data: [], error: null };
    if (conversationError) throw new Error(conversationError.message);
    const conversationsById = new Map((conversations ?? []).map((row: any) => [row.id, row]));
    const userIds = [
      ...new Set(
        (reports ?? []).flatMap((report: any) => {
          const conversation = conversationsById.get(report.conversation_id);
          return [report.reporter_id, conversation?.buyer_id, conversation?.seller_id].filter(
            Boolean,
          );
        }),
      ),
    ];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id,display_name").in("id", userIds)
      : { data: [] as any[] };
    const names = new Map<string, string>(
      (profiles ?? []).map((profile: any) => [
        profile.id,
        String(profile.display_name ?? "").trim() || "Bluebird member",
      ]),
    );
    return (reports ?? []).map((report: any) => {
      const conversation = conversationsById.get(report.conversation_id);
      return {
        id: report.id,
        conversationId: report.conversation_id,
        listingId: conversation?.listing_id ?? null,
        listingTitle: conversation?.asks?.products?.name ?? "Marketplace conversation",
        reporterName: names.get(report.reporter_id) ?? "Bluebird member",
        buyerName: names.get(conversation?.buyer_id) ?? "Bluebird member",
        sellerName: names.get(conversation?.seller_id) ?? "Bluebird member",
        reason: report.reason,
        status: report.status,
        adminNote: report.admin_note ?? null,
        assignedTo: report.assigned_to ?? null,
        createdAt: report.created_at,
        resolvedAt: report.resolved_at ?? null,
      };
    });
  });

export const resolveAdminConversationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      reportId: string;
      action: "assign" | "reviewed" | "dismissed";
      adminNote?: string | null;
    }) => {
      if (input.action !== "assign" && input.action !== "reviewed" && input.action !== "dismissed")
        throw new Error("Choose a report resolution.");
      const adminNote = input.adminNote == null ? null : String(input.adminNote).trim();
      if (adminNote && adminNote.length > 1000)
        throw new Error("Keep the note under 1,000 characters.");
      return { reportId: String(input.reportId), action: input.action, adminNote };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await (context.supabase as any).rpc("admin_resolve_conversation_report", {
      _report_id: data.reportId,
      _action: data.action,
      _admin_note: data.adminNote,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

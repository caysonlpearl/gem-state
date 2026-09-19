/* eslint-disable @typescript-eslint/no-explicit-any -- account-center tables are added by the linked migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ContactPreferences = {
  allowEmail: boolean;
  allowPhone: boolean;
  allowText: boolean;
  showContactButtons: boolean;
  allowInternalMessages: boolean;
};

const defaultContactPreferences: ContactPreferences = {
  allowEmail: true,
  allowPhone: false,
  allowText: false,
  showContactButtons: true,
  allowInternalMessages: true,
};

export const getMyContactPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactPreferences> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("account_contact_preferences")
      .select("allow_email,allow_phone,allow_text,show_contact_buttons,allow_internal_messages")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return defaultContactPreferences;
    return {
      allowEmail: data.allow_email !== false,
      allowPhone: data.allow_phone === true,
      allowText: data.allow_text === true,
      showContactButtons: data.show_contact_buttons !== false,
      allowInternalMessages: data.allow_internal_messages !== false,
    };
  });

export const updateMyContactPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<ContactPreferences>) => ({
    allowEmail: input.allowEmail !== false,
    allowPhone: input.allowPhone === true,
    allowText: input.allowText === true,
    showContactButtons: input.showContactButtons !== false,
    allowInternalMessages: input.allowInternalMessages !== false,
  }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.from("account_contact_preferences").upsert(
      {
        user_id: context.userId,
        allow_email: data.allowEmail,
        allow_phone: data.allowPhone,
        allow_text: data.allowText,
        show_contact_buttons: data.showContactButtons,
        allow_internal_messages: data.allowInternalMessages,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type SavedSearchFilters = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

export type SavedSearch = {
  id: string;
  name: string;
  search: SavedSearchFilters;
  emailAlerts: boolean;
  paused: boolean;
  lastMatchAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function savedSearch(row: any): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    search: (row.search ?? {}) as SavedSearchFilters,
    emailAlerts: row.email_alerts !== false,
    paused: row.paused === true,
    lastMatchAt: row.last_match_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const getMySavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavedSearch[]> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("saved_searches")
      .select("id,name,search,email_alerts,paused,last_match_at,created_at,updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(savedSearch);
  });

export const createSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; search?: Record<string, unknown>; emailAlerts?: boolean }) => {
    const name = String(input.name ?? "").trim();
    if (name.length < 1 || name.length > 80) throw new Error("Name your saved search.");
    return {
      name,
      search: input.search ?? {},
      emailAlerts: input.emailAlerts !== false,
    };
  })
  .handler(async ({ data, context }): Promise<SavedSearch> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("saved_searches")
      .insert({
        user_id: context.userId,
        name: data.name,
        search: data.search,
        email_alerts: data.emailAlerts,
      })
      .select("id,name,search,email_alerts,paused,last_match_at,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return savedSearch(row);
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; search?: Record<string, unknown>; emailAlerts?: boolean; paused?: boolean }) => {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (name.length < 1 || name.length > 80) throw new Error("Name your saved search.");
      updates["name"] = name;
    }
    if (input.search !== undefined) updates["search"] = input.search;
    if (input.emailAlerts !== undefined) updates["email_alerts"] = input.emailAlerts === true;
    if (input.paused !== undefined) updates["paused"] = input.paused === true;
    return { id: String(input.id), updates };
  })
  .handler(async ({ data, context }): Promise<SavedSearch> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("saved_searches")
      .update(data.updates)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,name,search,email_alerts,paused,last_match_at,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return savedSearch(row);
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client
      .from("saved_searches")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type NotificationPreferences = {
  messageAlerts: boolean;
  listingActivity: boolean;
  savedSearchMatches: boolean;
  reviewRequests: boolean;
  listingUpgradeReceipts: boolean;
  productUpdates: boolean;
  marketingEmail: boolean;
};

const defaultNotificationPreferences: NotificationPreferences = {
  messageAlerts: true,
  listingActivity: true,
  savedSearchMatches: true,
  reviewRequests: true,
  listingUpgradeReceipts: true,
  productUpdates: false,
  marketingEmail: false,
};

export const getMyNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPreferences> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("account_notification_preferences")
      .select("message_alerts,listing_activity,saved_search_matches,review_requests,listing_upgrade_receipts,product_updates,marketing_email")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return defaultNotificationPreferences;
    return {
      messageAlerts: data.message_alerts !== false,
      listingActivity: data.listing_activity !== false,
      savedSearchMatches: data.saved_search_matches !== false,
      reviewRequests: data.review_requests !== false,
      listingUpgradeReceipts: data.listing_upgrade_receipts !== false,
      productUpdates: data.product_updates === true,
      marketingEmail: data.marketing_email === true,
    };
  });

export const updateMyNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<NotificationPreferences>) => ({
    messageAlerts: input.messageAlerts !== false,
    listingActivity: input.listingActivity !== false,
    savedSearchMatches: input.savedSearchMatches !== false,
    reviewRequests: input.reviewRequests !== false,
    listingUpgradeReceipts: input.listingUpgradeReceipts !== false,
    productUpdates: input.productUpdates === true,
    marketingEmail: input.marketingEmail === true,
  }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.from("account_notification_preferences").upsert(
      {
        user_id: context.userId,
        message_alerts: data.messageAlerts,
        listing_activity: data.listingActivity,
        saved_search_matches: data.savedSearchMatches,
        review_requests: data.reviewRequests,
        listing_upgrade_receipts: data.listingUpgradeReceipts,
        product_updates: data.productUpdates,
        marketing_email: data.marketingEmail,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

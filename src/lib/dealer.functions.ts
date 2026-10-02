/* eslint-disable @typescript-eslint/no-explicit-any -- dealership tables are migration-backed */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicServerClient } from "@/lib/supabase-public.server";
import { browseClassifieds, type ClassifiedCard } from "@/lib/classifieds.functions";

const dealerInput = z.object({
  legalName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable(),
  website: z.string().trim().url().max(240).optional().nullable(),
  addressLine1: z.string().trim().max(160).optional().nullable(),
  addressLine2: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional().nullable(),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/).optional().nullable(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  acceptAgreements: z.literal(true),
});

export type DealerSetup = {
  exists: boolean;
  id: string | null;
  legalName: string;
  displayName: string;
  slug: string;
  phone: string;
  email: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  logoUrl: string;
  description: string;
  status: "draft" | "ready" | "suspended";
  agreementsAccepted: boolean;
  readiness: { identity: boolean; location: boolean; contact: boolean; agreements: boolean };
};

export type OwnedDealerSummary = { id: string; display_name: string; slug: string; status: string };

export type DealerMemberSummary = {
  dealer_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "owner" | "manager" | "inventory";
  status: "active" | "invited" | "disabled";
  created_at: string;
};

export type PublicDealerProfile = {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  logoUrl: string | null;
  description: string | null;
  listings: ClassifiedCard[];
};

export const getPublicDealer = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().toLowerCase().min(1).max(80) }).parse(input))
  .handler(async ({ data }): Promise<PublicDealerProfile | null> => {
    const client = publicServerClient();
    const { data: dealer, error } = await client
      .from("dealer_profiles")
      .select("id,legal_name,display_name,slug,phone,email,website,address_line1,city,state,postal_code,logo_url,description")
      .eq("slug", data.slug)
      .eq("status", "ready")
      .not("agreements_accepted_at", "is", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dealer) return null;
    const result = await browseClassifieds({ data: { dealerSlug: data.slug, page: 1, sort: "newest" } });
    return {
      id: dealer.id,
      legalName: dealer.legal_name,
      displayName: dealer.display_name,
      slug: dealer.slug,
      phone: dealer.phone,
      email: dealer.email,
      website: dealer.website,
      addressLine1: dealer.address_line1,
      city: dealer.city,
      state: dealer.state,
      postalCode: dealer.postal_code,
      logoUrl: dealer.logo_url,
      description: dealer.description,
      listings: result.listings,
    };
  });

async function requireDealerManager(context: { supabase: unknown; userId: string }, dealerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: isAdmin, error: roleError } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (roleError) throw new Error(roleError.message);
  if (isAdmin === true) return { admin, isAdmin: true };
  const { data: dealer, error } = await admin
    .from("dealer_profiles")
    .select("id,owner_user_id")
    .eq("id", dealerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!dealer || dealer.owner_user_id !== context.userId) {
    throw new Error("Dealership owner access is required.");
  }
  return { admin, isAdmin: false };
}

async function recordDealerAudit(
  admin: any,
  input: { dealerId: string | null; actorUserId: string; action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> },
) {
  await admin.from("dealer_audit_events").insert({
    dealer_id: input.dealerId,
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

export const getDealerSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DealerSetup> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("dealer_profiles")
      .select("id,legal_name,display_name,slug,phone,email,website,address_line1,address_line2,city,state,postal_code,logo_url,description,status,agreements_accepted_at")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as any;
    const identity = Boolean(row?.legal_name && row?.display_name && row?.slug);
    const location = Boolean(row?.address_line1 && row?.city && row?.state && row?.postal_code);
    const contact = Boolean(row?.phone || row?.email || row?.website);
    const agreements = Boolean(row?.agreements_accepted_at);
    return {
      exists: Boolean(row), id: row?.id ?? null, legalName: row?.legal_name ?? "", displayName: row?.display_name ?? "",
      slug: row?.slug ?? "", phone: row?.phone ?? "", email: row?.email ?? "", website: row?.website ?? "",
      addressLine1: row?.address_line1 ?? "", addressLine2: row?.address_line2 ?? "", city: row?.city ?? "",
      state: row?.state ?? "", postalCode: row?.postal_code ?? "", logoUrl: row?.logo_url ?? "", description: row?.description ?? "",
      status: row?.status ?? "draft", agreementsAccepted: agreements,
      readiness: { identity, location, contact, agreements },
    };
  });

export const saveDealerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => dealerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const payload = {
      owner_user_id: context.userId, legal_name: data.legalName, display_name: data.displayName, slug: data.slug,
      phone: data.phone || null, email: data.email || null, website: data.website || null,
      address_line1: data.addressLine1 || null, address_line2: data.addressLine2 || null, city: data.city || null,
      state: data.state || null, postal_code: data.postalCode || null, logo_url: data.logoUrl || null,
      description: data.description || null, status: "ready", agreements_accepted_at: new Date().toISOString(), agreements_version: "dealer-v1",
    };
    const { data: dealer, error } = await admin.from("dealer_profiles").upsert(payload, { onConflict: "owner_user_id" }).select("id,slug,status").single();
    if (error) throw new Error(error.message);
    const { error: memberError } = await admin.from("dealer_members").upsert({ dealer_id: dealer.id, user_id: context.userId, role: "owner", status: "active" }, { onConflict: "dealer_id,user_id" });
    if (memberError) throw new Error(memberError.message);
    await recordDealerAudit(admin, {
      dealerId: dealer.id,
      actorUserId: context.userId,
      action: "profile_saved",
      targetType: "dealer_profile",
      targetId: dealer.id,
      metadata: { status: dealer.status, slug: dealer.slug },
    });
    return dealer;
  });

export const getOwnedDealers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("dealer_profiles")
      .select("id,display_name,slug,status")
      .eq("owner_user_id", context.userId)
      .order("display_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDealerMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ dealerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DealerMemberSummary[]> => {
    const { admin } = await requireDealerManager(context, data.dealerId);
    const { data: members, error } = await admin
      .from("dealer_members")
      .select("dealer_id,user_id,role,status,created_at")
      .eq("dealer_id", data.dealerId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw new Error(users.error.message);
    const byId = new Map((users.data.users ?? []).map((user: any) => [user.id, user]));
    const profiles = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", (members ?? []).map((member: any) => member.user_id));
    const displayNames = new Map((profiles.data ?? []).map((profile: any) => [profile.id, profile.display_name]));
    return (members ?? []).map((member: any) => ({
      ...member,
      email: byId.get(member.user_id)?.email ?? null,
      display_name: displayNames.get(member.user_id) ?? null,
    }));
  });

export const addDealerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ dealerId: z.string().uuid(), email: z.string().trim().email(), role: z.enum(["manager", "inventory"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await requireDealerManager(context, data.dealerId);
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw new Error(users.error.message);
    const user = (users.data.users ?? []).find((candidate: any) => candidate.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) throw new Error("No Bluebird member exists with that email yet. They must create an account first.");
    const { data: member, error } = await admin
      .from("dealer_members")
      .upsert({ dealer_id: data.dealerId, user_id: user.id, role: data.role, status: "active" }, { onConflict: "dealer_id,user_id" })
      .select("dealer_id,user_id,role,status")
      .single();
    if (error) throw new Error(error.message);
    await recordDealerAudit(admin, { dealerId: data.dealerId, actorUserId: context.userId, action: "member_added", targetType: "dealer_member", targetId: user.id, metadata: { role: data.role } });
    return member;
  });

export const updateDealerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ dealerId: z.string().uuid(), userId: z.string().uuid(), role: z.enum(["manager", "inventory"]).optional(), status: z.enum(["active", "disabled"]).optional() }).refine((value) => value.role || value.status, "Choose a member change.").parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await requireDealerManager(context, data.dealerId);
    const updates: Record<string, string> = {};
    if (data.role) updates.role = data.role;
    if (data.status) updates.status = data.status;
    const { error } = await admin.from("dealer_members").update(updates).eq("dealer_id", data.dealerId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await recordDealerAudit(admin, { dealerId: data.dealerId, actorUserId: context.userId, action: "member_updated", targetType: "dealer_member", targetId: data.userId, metadata: updates });
    return { ok: true };
  });

export const getAdminDealerDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await (context.supabase as any).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Administrator access is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: dealers, error }, { data: sources, error: sourceError }, { data: members, error: memberError }] = await Promise.all([
      admin.from("dealer_profiles").select("id,owner_user_id,legal_name,display_name,slug,status,city,state,agreements_accepted_at,created_at,updated_at").order("created_at", { ascending: false }),
      admin.from("dealer_inventory_sources").select("id,dealer_id,status,last_success_at,last_error"),
      admin.from("dealer_members").select("dealer_id,user_id,role,status"),
    ]);
    if (error) throw new Error(error.message);
    if (sourceError) throw new Error(sourceError.message);
    if (memberError) throw new Error(memberError.message);
    return (dealers ?? []).map((dealer: any) => ({
      ...dealer,
      sourceCount: (sources ?? []).filter((source: any) => source.dealer_id === dealer.id).length,
      activeSourceCount: (sources ?? []).filter((source: any) => source.dealer_id === dealer.id && source.status === "active").length,
      memberCount: (members ?? []).filter((member: any) => member.dealer_id === dealer.id && member.status === "active").length,
    }));
  });

/* eslint-disable @typescript-eslint/no-explicit-any -- dealership tables are migration-backed */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

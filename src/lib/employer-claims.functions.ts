/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateEmployerClaimInput } from "./employer-claims-contract.ts";
import { employerKey } from "./employer-logo-match.ts";

/**
 * Employers claiming their business's presence on Jobs. Partner (Adzuna)
 * postings name the employer but the business never asked to be listed, so
 * a claim is a request: an admin verifies it with the business before the
 * employer is marked as claimed.
 */
export type MyEmployerClaim = { status: "pending" | "approved" | "rejected"; createdAt: string };

export const getMyEmployerClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { employerName: string }) => ({
    employerKey: employerKey(String(input?.employerName ?? "")),
  }))
  .handler(async ({ data, context }): Promise<MyEmployerClaim | null> => {
    if (data.employerKey.length < 3) return null;
    const { data: row } = await (context.supabase as any)
      .from("employer_claims")
      .select("status, created_at")
      .eq("employer_key", data.employerKey)
      .eq("user_id", context.userId)
      .maybeSingle();
    return row ? { status: row.status, createdAt: row.created_at } : null;
  });

export const claimEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Parameters<typeof validateEmployerClaimInput>[0]) =>
    validateEmployerClaimInput(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await (supabaseAdmin as any)
      .from("employer_claims")
      .select("id")
      .eq("employer_key", data.employerKey)
      .eq("status", "approved")
      .limit(1);
    if (existing?.length) throw new Error("This business has already been claimed.");
    const { error } = await (context.supabase as any).from("employer_claims").insert({
      employer_key: data.employerKey,
      employer_name: data.employerName,
      city: data.city,
      state: data.state,
      user_id: context.userId,
      role: data.role,
      contact: data.contact,
      note: data.note,
    });
    if (error?.code === "23505") return { status: "pending" as const, duplicate: true };
    if (error) throw new Error("Could not send your claim. Try again.");
    return { status: "pending" as const, duplicate: false };
  });

export type AdminEmployerClaim = {
  id: string;
  employerName: string;
  city: string;
  state: string;
  role: string;
  contact: string;
  note: string | null;
  claimantEmail: string | null;
  createdAt: string;
};

async function isAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  return Boolean(data);
}

export const getAdminEmployerClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminEmployerClaim[]> => {
    if (!(await isAdmin(context))) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: claims } = await admin
      .from("employer_claims")
      .select("id, employer_name, city, state, user_id, role, contact, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = (claims ?? []) as any[];
    if (!rows.length) return [];
    const emails = new Map<string, string | null>();
    for (const userId of new Set(rows.map((row) => row.user_id as string))) {
      const { data: user } = await admin.auth.admin.getUserById(userId);
      emails.set(userId, user?.user?.email ?? null);
    }
    return rows.map((row) => ({
      id: row.id,
      employerName: row.employer_name,
      city: row.city ?? "",
      state: row.state ?? "",
      role: row.role,
      contact: row.contact,
      note: row.note,
      claimantEmail: emails.get(row.user_id) ?? null,
      createdAt: row.created_at,
    }));
  });

export const reviewEmployerClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { claimId: string; approve: boolean }) => ({
    claimId: String(input?.claimId ?? ""),
    approve: Boolean(input?.approve),
  }))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Administrator access required.");
    const now = new Date().toISOString();
    const { data: updated, error } = await (context.supabase as any)
      .from("employer_claims")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_at: now,
        reviewed_by: context.userId,
      })
      .eq("id", data.claimId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("That claim was already reviewed.");
    return { ok: true as const };
  });

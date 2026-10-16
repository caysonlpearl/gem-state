/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Owners claiming their business's directory entry in Services. A claim is
 * a request: an admin checks it (calls the business number, or emails the
 * business address) before the entry is marked as theirs.
 */
const directoryIdOf = (value: unknown) => {
  const id = String(value ?? "");
  return /^fsq-[0-9a-f]{24}$/.test(id) ? id : "";
};

export type MyServiceClaim = { status: "pending" | "approved" | "rejected"; createdAt: string };

export const getMyServiceClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { directoryId: string }) => ({
    directoryId: directoryIdOf(input?.directoryId),
  }))
  .handler(async ({ data, context }): Promise<MyServiceClaim | null> => {
    if (!data.directoryId) return null;
    const { data: row } = await (context.supabase as any)
      .from("service_directory_claims")
      .select("status, created_at")
      .eq("directory_id", data.directoryId)
      .eq("user_id", context.userId)
      .maybeSingle();
    return row ? { status: row.status, createdAt: row.created_at } : null;
  });

export const claimServiceBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { directoryId: string; role: string; contact: string; note?: string }) => {
    const directoryId = directoryIdOf(input?.directoryId);
    const role = String(input?.role ?? "").trim();
    const contact = String(input?.contact ?? "").trim();
    const note = String(input?.note ?? "").trim();
    if (!directoryId) throw new Error("This business can't be claimed.");
    if (role.length < 2 || role.length > 80) throw new Error("Tell us your role at the business.");
    if (contact.length < 3 || contact.length > 200)
      throw new Error("Add the business phone or email we can reach you at.");
    if (note.length > 1000) throw new Error("Keep the note under 1,000 characters.");
    return { directoryId, role, contact, note: note || null };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business } = await (supabaseAdmin as any)
      .from("service_directory")
      .select("id, claimed_by")
      .eq("id", data.directoryId)
      .eq("hidden", false)
      .maybeSingle();
    if (!business) throw new Error("This business is no longer listed.");
    if (business.claimed_by) throw new Error("This business has already been claimed.");
    const { error } = await (context.supabase as any).from("service_directory_claims").insert({
      directory_id: data.directoryId,
      user_id: context.userId,
      role: data.role,
      contact: data.contact,
      note: data.note,
    });
    if (error?.code === "23505") return { status: "pending" as const, duplicate: true };
    if (error) throw new Error("Could not send your claim. Try again.");
    return { status: "pending" as const, duplicate: false };
  });

export type AdminServiceClaim = {
  id: string;
  directoryId: string;
  businessName: string;
  businessCity: string;
  businessPhone: string | null;
  businessEmail: string | null;
  businessWebsite: string | null;
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

export const getAdminServiceClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminServiceClaim[]> => {
    if (!(await isAdmin(context))) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: claims } = await admin
      .from("service_directory_claims")
      .select("id, directory_id, user_id, role, contact, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = (claims ?? []) as any[];
    if (!rows.length) return [];
    const { data: businesses } = await admin
      .from("service_directory")
      .select("id, name, city, phone, email, website")
      .in(
        "id",
        rows.map((row) => row.directory_id),
      );
    const byId = new Map(((businesses ?? []) as any[]).map((b) => [b.id, b]));
    const emails = new Map<string, string | null>();
    for (const userId of new Set(rows.map((row) => row.user_id as string))) {
      const { data: user } = await admin.auth.admin.getUserById(userId);
      emails.set(userId, user?.user?.email ?? null);
    }
    return rows.map((row) => {
      const business = byId.get(row.directory_id) ?? {};
      return {
        id: row.id,
        directoryId: row.directory_id,
        businessName: business.name ?? "Unknown business",
        businessCity: business.city ?? "",
        businessPhone: business.phone ?? null,
        businessEmail: business.email ?? null,
        businessWebsite: business.website ?? null,
        role: row.role,
        contact: row.contact,
        note: row.note,
        claimantEmail: emails.get(row.user_id) ?? null,
        createdAt: row.created_at,
      };
    });
  });

export const reviewServiceClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { claimId: string; approve: boolean }) => ({
    claimId: String(input?.claimId ?? ""),
    approve: Boolean(input?.approve),
  }))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Administrator access required.");
    const now = new Date().toISOString();
    const { data: updated, error } = await (context.supabase as any)
      .from("service_directory_claims")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_at: now,
        reviewed_by: context.userId,
      })
      .eq("id", data.claimId)
      .eq("status", "pending")
      .select("directory_id, user_id");
    if (error) throw new Error(error.message);
    const claim = updated?.[0];
    if (!claim) throw new Error("That claim was already reviewed.");
    if (data.approve) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("service_directory")
        .update({ claimed_by: claim.user_id, claimed_at: now, updated_at: now })
        .eq("id", claim.directory_id)
        .is("claimed_by", null);
    }
    return { ok: true as const };
  });

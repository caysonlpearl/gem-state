import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MEMBER_INTENTS = ["buying", "selling", "shopping_in_park", "browsing"] as const;
export type MemberIntent = (typeof MEMBER_INTENTS)[number];

export type MyAccount = {
  userId: string;
  email: string | null;
  displayName: string | null;
  homeResortCode: string | null;
  primaryIntent: MemberIntent | null;
  onboardedAt: string | null;
  roles: string[];
  /** Fraction 0–1 of the profile fields we ask for during onboarding. */
  completion: number;
};

// The legacy column is retained for schema compatibility, but it now stores
// the member's primary marketplace/state code rather than a resort.
const MARKET_CODES = ["ID"] as const;

function isIntent(value: unknown): value is MemberIntent {
  return typeof value === "string" && (MEMBER_INTENTS as readonly string[]).includes(value);
}

/**
 * Authenticated server function. Reads the caller's own profile and roles
 * through an RLS-scoped client — the row is reachable only because the
 * bearer token resolves to that user.
 */
export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccount> => {
    const { supabase, userId, claims } = context;

    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, home_resort_code, primary_intent, onboarded_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (rolesError) throw new Error(rolesError.message);

    const filled = [
      Boolean(profile?.display_name),
      Boolean(profile?.home_resort_code),
      Boolean(profile?.primary_intent),
    ].filter(Boolean).length;

    return {
      userId,
      email: (claims as { email?: string } | null)?.email ?? null,
      displayName: profile?.display_name ?? null,
      homeResortCode: profile?.home_resort_code ?? null,
      primaryIntent: isIntent(profile?.primary_intent) ? profile.primary_intent : null,
      onboardedAt: profile?.onboarded_at ?? null,
      roles: (roles ?? []).map((r) => r.role as string),
      completion: filled / 3,
    };
  });

/** Authenticated write, also RLS-scoped to the caller's own row. */
export const updateMyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string }) => {
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 40) {
      throw new Error("Display name must be between 2 and 40 characters.");
    }
    return { displayName };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, displayName: data.displayName };
  });

/**
 * Profile completion / first-login onboarding write. Server-validated and
 * RLS-scoped: a caller can only ever write their own profile row.
 * `markOnboarded` records that the member finished the welcome steps.
 */
export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      displayName: string;
      homeResortCode: string;
      primaryIntent: string;
      markOnboarded?: boolean;
    }) => {
      const displayName = input.displayName.trim();
      if (displayName.length < 2 || displayName.length > 40) {
        throw new Error("Display name must be between 2 and 40 characters.");
      }
      if (!(MARKET_CODES as readonly string[]).includes(input.homeResortCode)) {
        throw new Error("Choose Idaho as your primary marketplace.");
      }
      if (!isIntent(input.primaryIntent)) {
        throw new Error("Choose what you mainly plan to do.");
      }
      return {
        displayName,
        homeResortCode: input.homeResortCode,
        primaryIntent: input.primaryIntent,
        markOnboarded: input.markOnboarded === true,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        home_resort_code: data.homeResortCode,
        primary_intent: data.primaryIntent,
        ...(data.markOnboarded ? { onboarded_at: new Date().toISOString() } : {}),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

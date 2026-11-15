/* eslint-disable @typescript-eslint/no-explicit-any -- private shopping schema */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
async function admin(context: { supabase: unknown; userId: string }) {
  (await import("@tanstack/react-start/server")).setResponseHeader(
    "Cache-Control",
    "private, no-store",
  );
  const role = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (role.error || role.data !== true) throw Error("Administrator access required.");
  return (await import("./shopping.server")).shoppingDb();
}
export const getShoppingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [report, controls, evaluations, review] = await Promise.all([
      db.rpc("shopping_report"),
      db
        .from("shopping_controls")
        .select(
          "tracking,recommendations,embeddings,learning,notifications,advertising,model,model_version,updated_at",
        )
        .single(),
      db
        .from("shopping_model_evaluations")
        .select("week,baseline,challenger,outcomes,promoted")
        .order("week", { ascending: false })
        .limit(4),
      db.rpc("shopping_ranking_review_ready"),
    ]);
    if (report.error || controls.error || evaluations.error)
      throw Error("Shopping report unavailable. Check migration status.");
    if (review.error && !["PGRST202", "42883"].includes(review.error.code))
      throw Error("Ranking review status unavailable. Reload the report.");
    return {
      ...report.data,
      controls: controls.data,
      evaluations: evaluations.data,
      rankingReviewReady: !review.error && review.data === true,
    };
  });
export const setShoppingControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: z.enum([
          "tracking",
          "recommendations",
          "notifications",
          "advertising",
          "embeddings",
          "learning",
        ]),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const r = await db
      .from("shopping_controls")
      .update({ [data.name]: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (r.error) throw Error("Pause control could not be saved.");
    return { ok: true };
  });

export const reviewShoppingRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expectedVersion: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await admin(context);
    // Use the member client: the database derives the administrator and session.
    const result = await (context.supabase as any).rpc("review_shopping_ranking", {
      _week: data.week,
      _expected_version: data.expectedVersion,
    });
    if (result.error || result.data?.ok !== true)
      throw Error(
        "Ranking candidate could not be applied. Reload the report to check eligibility and the active model.",
      );
    return { ok: true as const, modelVersion: String(result.data.modelVersion) };
  });

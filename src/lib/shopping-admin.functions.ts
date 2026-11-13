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
    const [report, controls, evaluations] = await Promise.all([
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
    ]);
    if (report.error || controls.error || evaluations.error)
      throw Error("Shopping report unavailable. Check migration status.");
    return { ...report.data, controls: controls.data, evaluations: evaluations.data };
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

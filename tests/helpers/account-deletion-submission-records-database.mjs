import { readFileSync } from "node:fs";
import { variationDatabase, variationSchema } from "./catalog-admin-variation-database.mjs";
export const submissionRecordsMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115080000_account_deletion_submissions.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function submissionRecordsDatabase({ install = true, provided } = {}) {
  const db = await variationDatabase({ provided });
  try {
    // The early photo fixture included a synthetic label. The captured table
    // has caption instead; enforce the complete real source layout here.
    await db.exec("alter table product_suggestion_media drop column if exists label");
    // Replace the early photo fixture's generic NO ACTION keys with the captured
    // stock CASCADE actions, so tests exercise the actual unsafe-delete baseline.
    for (const [table, name] of [
      ["product_suggestions", "product_suggestions_submitted_by_fkey"],
      ["product_suggestion_media", "product_suggestion_media_suggestion_id_fkey"],
    ]) {
      const c = variationSchema.rows
        .flatMap((r) => r.metadata.constraints)
        .find((c) => c.table === table && c.name === name);
      await db.exec(
        `alter table public.${table} drop constraint ${name},add constraint ${name} ${c.definition}`,
      );
    }
    if (install) await db.exec(submissionRecordsMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}

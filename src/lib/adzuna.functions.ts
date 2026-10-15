import { createServerFn } from "@tanstack/react-start";
import { adzunaSearchSchema, type AdzunaJob } from "./adzuna-contract";

export const searchAdzunaJobs = createServerFn({ method: "GET" })
  .inputValidator(adzunaSearchSchema)
  .handler(async ({ data }) => {
    const { searchJobs } = await import("./adzuna.server");
    return searchJobs(data);
  });

/**
 * One Adzuna job for its Bluebird page. Adzuna has no fetch-by-id endpoint,
 * so this reads the job from the shared search cache, where it was saved
 * when the search that showed it ran. Cache entries last six hours; an older
 * link gets null and the page says the job is no longer listed.
 */
export const getAdzunaJob = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => ({
    id: /^\d{1,20}$/.test(String(input?.id ?? "")) ? String(input.id) : "",
  }))
  .handler(async ({ data }): Promise<AdzunaJob | null> => {
    if (!data.id) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any)
      .from("adzuna_search_cache")
      .select("payload")
      .contains("payload", { jobs: [{ id: data.id }] })
      .order("expires_at", { ascending: false })
      .limit(1);
    const jobs = (rows?.[0]?.payload?.jobs ?? []) as AdzunaJob[];
    const job = jobs.find((item) => item.id === data.id);
    if (!job) return null;
    // Entries cached before salaries were kept have none.
    return {
      ...job,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      salaryIsEstimate: Boolean(job.salaryIsEstimate),
    };
  });

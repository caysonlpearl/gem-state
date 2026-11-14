import type { AdzunaSearch, AdzunaResult } from "./adzuna-contract";

/** Scheduled inventory maintenance only. The existing reservation checks cache,
 * rate and monthly budgets; an unexpired six-hour key performs no provider call.
 * Never call this from Home/search rendering or a phone refresh gesture. */
export async function refreshAdzunaHomeJobs(
  search?: (input: AdzunaSearch) => Promise<AdzunaResult>,
) {
  try {
    const read = search ?? (await import("./adzuna.server")).searchJobs;
    const result = await read({ what: "", where: "Idaho", page: 1 });
    if (
      !result ||
      !["ok", "limited", "unavailable"].includes(result.status) ||
      !Array.isArray(result.jobs)
    )
      return { status: "unavailable" as const, jobs: 0 };
    return { status: result.status, jobs: result.status === "ok" ? result.jobs.length : 0 };
  } catch {
    return { status: "unavailable" as const, jobs: 0 };
  }
}

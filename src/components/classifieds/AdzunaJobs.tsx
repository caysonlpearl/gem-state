import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchAdzunaJobs } from "@/lib/adzuna.functions";

export function AdzunaJobs() {
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("Idaho");
  const [search, setSearch] = useState({ what: "", where: "Idaho", page: 1 });
  const query = useQuery({
    queryKey: ["adzuna-jobs", search],
    queryFn: () => searchAdzunaJobs({ data: search }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const result = query.data;
  const unavailable = query.isError || (result && result.status !== "ok");
  return (
    <section aria-labelledby="adzuna-jobs-heading" className="floating-card mt-8 p-5 sm:p-7">
      <h2 id="adzuna-jobs-heading" className="text-xl font-bold">
        More jobs from Adzuna
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Explore openings from Adzuna across the United States. Apply through Adzuna; these jobs are
        separate from listings posted on Bluebird.
      </p>
      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch({ what: what.trim(), where: where.trim() || "Idaho", page: 1 });
        }}
      >
        <label className="text-sm font-semibold">
          Job title or keywords
          <input
            className="filter-input mt-1 w-full"
            value={what}
            maxLength={120}
            onChange={(event) => setWhat(event.target.value)}
            placeholder="e.g. nurse, driver, accountant"
          />
        </label>
        <label className="text-sm font-semibold">
          City, state, or ZIP
          <input
            className="filter-input mt-1 w-full"
            value={where}
            maxLength={100}
            minLength={2}
            required
            onChange={(event) => setWhere(event.target.value)}
            placeholder="Boise, Idaho"
          />
        </label>
        <button
          type="submit"
          className="self-end rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          Search Adzuna jobs
        </button>
      </form>
      <div aria-live="polite" className="mt-5">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading jobs…</p>
        ) : unavailable ? (
          <p className="text-sm text-muted-foreground">
            Adzuna jobs are temporarily unavailable. Please try again later. You can still browse
            jobs posted on Bluebird.
          </p>
        ) : result?.jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Adzuna jobs match this search. Try another keyword or location.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Adzuna results for {search.where}
              {search.what ? ` · ${search.what}` : ""}. Listings refresh periodically.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {result?.jobs.map((job) => (
                <article
                  key={job.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5"
                >
                  <h3 className="font-bold text-lg">{job.title}</h3>
                  <p className="mt-1 text-sm font-semibold">{job.company}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{job.location}</p>
                  <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
                    {job.description}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                    >
                      View job &amp; apply{" "}
                      <span className="sr-only">on Adzuna (opens a new tab)</span>
                    </a>
                    <a
                      href="https://www.adzuna.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[23px] min-w-[116px] items-center justify-center text-[23px] font-bold leading-none text-primary"
                    >
                      Adzuna
                    </a>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-center gap-4">
              <button
                disabled={search.page === 1}
                onClick={() => setSearch({ ...search, page: search.page - 1 })}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm">Page {search.page}</span>
              <button
                disabled={
                  search.page >= 5 ||
                  !result ||
                  result.total <= search.page * 20 ||
                  result.jobs.length === 0
                }
                onClick={() => setSearch({ ...search, page: search.page + 1 })}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

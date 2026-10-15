import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowSquareOut, Briefcase, CaretRight, Clock, MapPin } from "@phosphor-icons/react";

import { EmployerTile } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { brand } from "@/config/brand";
import { getAdzunaJob } from "@/lib/adzuna.functions";
import { formatJobPay, postedAge } from "@/lib/classifieds-display";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";

const adzunaJobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ["adzuna-job", jobId],
    staleTime: PUBLIC_PAGE_STALE_MS,
    queryFn: () => getAdzunaJob({ data: { id: jobId } }),
  });

/**
 * A job from Adzuna's feed, shown on Bluebird before the visitor chooses to
 * apply. Applying goes through Adzuna's own link (their terms require it).
 * Kept out of search results: the posting belongs to the employer and Adzuna,
 * not Bluebird, and the same text is on their sites.
 */
export const Route = createFileRoute("/jobs/adzuna/$jobId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(adzunaJobQuery(params.jobId)),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.title} — ${loaderData.company || "Job"} in ${loaderData.location} — ${brand.name}`
          : `Job no longer listed — ${brand.name}`,
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: AdzunaJobPage,
});

function AdzunaJobPage() {
  const { jobId } = Route.useParams();
  const { data: job } = useSuspenseQuery(adzunaJobQuery(jobId));

  if (!job) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-10 sm:px-7">
        <BluebirdEmptyState
          title="This job is no longer listed"
          description="Job postings from our partners change often. Browse the latest local jobs instead."
        >
          <a
            href="/browse?category=jobs"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground"
          >
            See local jobs
          </a>
        </BluebirdEmptyState>
      </main>
    );
  }

  const pay = formatJobPay({
    payType: "Salary",
    payMin: job.salaryMin ?? 0,
    payMax: job.salaryMax ?? 0,
    payEstimated: Boolean(job.salaryMin && job.salaryIsEstimate),
  });
  const facts: [React.ReactNode, string][] = [
    [<MapPin key="m" size={15} className="text-primary" />, job.location],
    ...(job.employmentType === "Not specified"
      ? []
      : ([[<Briefcase key="b" size={15} className="text-primary" />, job.employmentType]] as [
          React.ReactNode,
          string,
        ][])),
    [
      <Clock key="c" size={15} className="text-primary" />,
      `Posted ${postedAge(job.createdAt).toLowerCase()}`,
    ],
  ];

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-7 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
      >
        <a href="/browse?category=jobs" className="hover:text-foreground">
          Jobs
        </a>
        <CaretRight size={13} aria-hidden="true" />
        <span className="truncate text-foreground">{job.title}</span>
      </nav>

      <article className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <EmployerTile name={job.company || job.title} size="lg" />
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[30px]">
              {job.title}
            </h1>
            {job.company ? (
              <p className="mt-1 text-[15px] font-medium text-muted-foreground">{job.company}</p>
            ) : null}
          </div>
        </div>

        <p className="numeric mt-5 text-[22px] font-bold">{pay}</p>
        {job.salaryMin && job.salaryIsEstimate ? (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Estimated by Adzuna from similar jobs; the employer didn&apos;t list pay.
          </p>
        ) : null}

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
          {facts.map(([icon, label]) => (
            <li key={label} className="inline-flex items-center gap-1.5">
              {icon}
              {label}
            </li>
          ))}
        </ul>

        {job.description ? (
          <section className="mt-6 border-t border-border pt-5">
            <h2 className="text-[16px] font-semibold">About this job</h2>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">
              {job.description.replace(/\\[nr]/g, "\n").replace(/\n{2,}/g, "\n")}
            </p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              The full description is on the employer&apos;s posting.
            </p>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[14px] font-bold text-primary-foreground hover:opacity-90"
          >
            Apply on the employer&apos;s site <ArrowSquareOut size={16} aria-hidden="true" />
          </a>
          <p className="text-[12px] text-muted-foreground">
            Opens the full posting through Adzuna.
          </p>
        </div>
      </article>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Jobs by{" "}
        <a
          href="https://www.adzuna.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[23px] min-w-[116px] items-center text-[23px] font-bold leading-none text-primary"
        >
          Adzuna
        </a>
      </p>
    </main>
  );
}

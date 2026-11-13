import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getShoppingReport, setShoppingControl } from "@/lib/shopping-admin.functions";
export const Route = createFileRoute("/_authenticated/admin/shopping")({
  head: () => ({
    meta: [
      { title: "Shopping performance — Bluebird operations" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShoppingReport,
});
function ShoppingReport() {
  const load = useServerFn(getShoppingReport),
    save = useServerFn(setShoppingControl),
    cache = useQueryClient();
  const query = useQuery({
    queryKey: ["shopping-report"],
    queryFn: () => load(),
    staleTime: 60000,
  });
  const mutation = useMutation({
    mutationFn: (data: {
      name:
        | "tracking"
        | "recommendations"
        | "notifications"
        | "advertising"
        | "embeddings"
        | "learning";
      enabled: boolean;
    }) => save({ data }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["shopping-report"] }),
  });
  const r = query.data;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <Link to="/admin" className="text-sm underline">
        Operations
      </Link>
      <h1 className="text-3xl font-semibold">Shopping performance</h1>
      <p className="text-sm text-muted-foreground">
        Last 30 days. Seller contacts per shopper are the primary outcome. A stable 10% comparison
        group receives explicit saved alerts and history tools. Broader recommendations and
        reminders are withheld for comparison.
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {r && (
        <>
          <section className="grid gap-4 sm:grid-cols-4">
            {(
              [
                ["tracking", "Activity collection"],
                ["embeddings", "Listing embedding jobs"],
                ["learning", "Weekly ranking updates"],
                ["recommendations", "Recommendations"],
                ["notifications", "Shopping delivery"],
                ["advertising", "Advertising adapters"],
              ] as const
            ).map(([name, label]) => (
              <label className="rounded-xl border p-4" key={name}>
                <input
                  type="checkbox"
                  checked={r.controls[name]}
                  disabled={mutation.isPending}
                  onChange={(e) => mutation.mutate({ name, enabled: e.target.checked })}
                />{" "}
                <span>{label}</span>
              </label>
            ))}
          </section>
          {mutation.error && <p role="alert">{mutation.error.message}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {r.cohorts.map(
              (c: {
                holdout: boolean;
                shoppers: number;
                views: number;
                contact_shoppers: number;
                accepted_inquiries: number;
                verified_purchases: number;
                returning_from_email: number;
              }) => (
                <section key={String(c.holdout)} className="rounded-2xl border p-5">
                  <h2 className="font-semibold">
                    {c.holdout ? "Comparison group" : "Personalization group"}
                  </h2>
                  <p className="mt-3 text-2xl font-semibold">
                    {c.shoppers ? ((c.contact_shoppers / c.shoppers) * 100).toFixed(1) : "0"}%
                    contacted a seller
                  </p>
                  <p className="mt-2 text-sm">
                    {c.shoppers} shoppers · {c.views} listing views · {c.accepted_inquiries}{" "}
                    accepted inquiries · {c.verified_purchases} verified purchases
                  </p>
                  <p className="mt-2 text-sm">
                    {c.returning_from_email} shoppers returned through an email link
                  </p>
                </section>
              ),
            )}
          </div>
          <section className="rounded-2xl border p-5">
            <h2 className="font-semibold">Delivery and capacity</h2>
            <p className="mt-3 text-sm">
              {r.deliveries.sent} deliveries · {r.deliveries.clicked} clicked ·{" "}
              {r.deliveries.opened_approximate} approximate opens · {r.deliveries.failed} failed ·{" "}
              {r.unsubscribes} opt-outs
            </p>
            <p className="mt-2 text-sm">
              {r.deliveries.complaints} recorded complaints · {r.deliveries.bounced} recorded
              bounces. Provider delivery reporting requires the signed email webhook.
            </p>
            <p className="mt-2 text-sm">
              {r.catalog} eligible listings · {r.vectors} current embeddings ·{" "}
              {(r.activity_bytes / 1048576).toFixed(1)} MB activity ·{" "}
              {(r.vector_bytes / 1048576).toFixed(1)} MB vectors/index
            </p>
            <p className="mt-2 text-sm">
              Queued: {r.queue.pending ?? 0} · Processing: {r.queue.processing ?? 0} · Suppressed:{" "}
              {r.queue.suppressed ?? 0}. Active model: {r.controls.model_version}
            </p>
          </section>
          <section className="rounded-2xl border p-5">
            <h2 className="font-semibold">Weekly ranking evaluations</h2>
            {r.evaluations.length ? (
              r.evaluations.map((e: { week: string; outcomes: number; promoted: boolean }) => (
                <p key={e.week} className="mt-2 text-sm">
                  {e.week}: {e.outcomes} shoppers with verified outcomes ·{" "}
                  {e.promoted ? "challenger promoted" : "baseline retained"}
                </p>
              ))
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                The baseline remains active until enough verified outcomes exist to evaluate a
                challenger.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

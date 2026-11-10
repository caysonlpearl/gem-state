import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDealerInventory } from "@/lib/dealer-onboarding.functions";

export function DealerInventoryPanel() {
  const load = useServerFn(getMyDealerInventory);
  const query = useQuery({ queryKey: ["my-dealer-inventory"], queryFn: () => load() });
  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Loading dealership inventory…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load dealership inventory. Please try again.
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <div className="space-y-5">
      {query.data.map((dealer) => (
        <section key={dealer.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {dealer.logoUrl ? (
                <img
                  src={dealer.logoUrl}
                  alt={`${dealer.name} logo`}
                  className="mb-3 h-14 w-56 object-contain object-left"
                />
              ) : null}
              <h2 className="text-xl font-semibold">{dealer.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {dealer.records.length} vehicles assigned to your dealership. Inventory updates from
                your feed.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dealer.email} · {dealer.phone}
              </p>
            </div>
            <div className="flex gap-4 text-sm text-primary">
              <Link to="/dealers/$slug" params={{ slug: dealer.slug }}>
                View dealership
              </Link>
              <Link to="/account" search={{ section: "messages" }}>
                Open inbox
              </Link>
            </div>
          </div>
          <div className="mt-4 max-h-[440px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2">Vehicle</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dealer.records.map((record) => (
                  <tr key={record.id} className="border-t border-border">
                    <td className="py-3">
                      {record.status === "active" ? (
                        <Link
                          to="/listings/$listingId"
                          params={{ listingId: `dealerfeed-${record.id}` }}
                          className="text-primary hover:underline"
                        >
                          {record.title}
                        </Link>
                      ) : (
                        record.title
                      )}
                    </td>
                    <td>
                      {record.priceCents
                        ? new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          }).format(record.priceCents / 100)
                        : "Price needed"}
                    </td>
                    <td>{record.status === "invalid" ? "Needs review" : record.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatCircleDots, Car, UserCircle, Eye } from "@phosphor-icons/react";
import { getDealerAccountPreview } from "@/lib/dealer-onboarding.functions";
import { DealerInventoryView } from "./DealerInventoryPanel";
import { VerifiedDealerBadge } from "@/components/dealers/VerifiedDealerBadge";

export function DealerAccountPreview({
  dealerId,
  onClose,
}: {
  dealerId: string;
  onClose: () => void;
}) {
  const load = useServerFn(getDealerAccountPreview);
  const query = useQuery({
    queryKey: ["dealer-account-preview", dealerId],
    queryFn: () => load({ data: { dealerId } }),
  });
  const [tab, setTab] = useState("inventory");
  if (query.isLoading) return <p className="text-sm">Loading account preview…</p>;
  if (query.error || !query.data) return <p role="alert">Could not load this account preview.</p>;
  const { inventory: dealer, loginEmail, activated, messageCount, postalCode } = query.data;
  return (
    <section
      className="overflow-hidden rounded-[28px] border border-primary/20 bg-card shadow-sm"
      aria-label="Dealership account preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-6 py-4 text-primary-foreground">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Eye size={18} /> Read-only dealership account preview
          </p>
          <p className="mt-1 text-xs opacity-80">
            No invitation sent. You are viewing as an administrator, without signing in as the
            dealer.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/40 px-4 py-2 text-xs font-semibold"
        >
          Close preview
        </button>
      </div>
      <div className="p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {dealer.logoUrl ? (
            <img
              src={dealer.logoUrl}
              alt={`${dealer.name} logo`}
              className="h-14 w-44 object-contain"
            />
          ) : null}
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {dealer.name}
              <VerifiedDealerBadge />
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Private login: {loginEmail} · {activated ? "Activated" : "Awaiting first sign-in"}
            </p>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
          <nav aria-label="Dealer account preview sections" className="flex gap-2 lg:flex-col">
            {[
              { value: "inventory", label: "My listings", Icon: Car },
              { value: "messages", label: "Messages", Icon: ChatCircleDots },
              { value: "profile", label: "Business profile", Icon: UserCircle },
            ].map(({ value, label, Icon }) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setTab(String(value))}
                aria-current={tab === value ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-semibold ${tab === value ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-primary"}`}
              >
                <Icon size={17} />
                {String(label)}
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {tab === "inventory" ? <DealerInventoryView dealers={[dealer]} preview /> : null}
            {tab === "messages" ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Messages
                </p>
                <h3 className="mt-2 text-xl font-semibold">
                  Keep marketplace conversations together
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Buyer messages are saved to this account immediately and appear here when the
                  dealer signs in.
                </p>
                <div className="mt-5 grid min-h-[380px] rounded-2xl border border-border lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                    <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                      Search messages
                    </div>
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      {messageCount
                        ? `${messageCount} saved conversations`
                        : "No conversations yet"}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center p-7 text-center">
                    <ChatCircleDots size={38} weight="duotone" className="text-primary/60" />
                    <p className="mt-4 font-semibold">
                      {messageCount
                        ? "Messages are waiting in the dealership inbox"
                        : "Your buyer conversations will appear here"}
                    </p>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      The dealer can reply, review vehicle details, and manage conversations from
                      Bluebird Messages. This preview does not open or send messages.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            {tab === "profile" ? (
              <div className="rounded-2xl border border-border p-6">
                <h3 className="text-xl font-semibold">Business profile</h3>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ["Dealership", dealer.name],
                    ["Phone", dealer.phone],
                    ["Public email", dealer.email || "Not displayed — dealer can add one later"],
                    ["Website", dealer.website],
                    [
                      "Address",
                      [dealer.address, dealer.city, dealer.state, postalCode]
                        .filter(Boolean)
                        .join(", "),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 text-xs text-muted-foreground">
                  The dealer can edit these details from Dealer setup after signing in. Their
                  private login email is separate from the public contact email.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

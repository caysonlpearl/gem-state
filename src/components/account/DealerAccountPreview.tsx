import { DealerProfileForm, type DealerProfileDraft } from "@/components/dealers/DealerProfileForm";
import { DealerPerformancePanel } from "./DealerPerformancePanel";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatCircleDots, Car, UserCircle, Eye, ChartBar, Key } from "@phosphor-icons/react";
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
  const [accessStatus, setAccessStatus] = useState("");
  if (query.isLoading) return <p className="text-sm">Loading account preview…</p>;
  if (query.error || !query.data) return <p role="alert">Could not load this account preview.</p>;
  const { inventory: dealer, loginEmail, activated, messageCount, profile } = query.data;
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
            Previewing as an administrator without signing in as the dealer. Opening this preview
            does not send an invitation.
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
          <nav
            aria-label="Dealer account preview sections"
            className="flex gap-2 overflow-x-auto lg:flex-col"
          >
            {[
              { value: "inventory", label: "My listings", Icon: Car },
              { value: "messages", label: "Messages", Icon: ChatCircleDots },
              { value: "profile", label: "Business profile", Icon: UserCircle },
              { value: "performance", label: "Performance", Icon: ChartBar },
              { value: "access", label: "Account access", Icon: Key },
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
              <div>
                <h3 className="mb-4 text-xl font-semibold">Business profile</h3>
                <DealerProfilePreview key={dealerId} profile={profile} />
              </div>
            ) : null}
            {tab === "performance" ? <DealerPerformancePanel dealerId={dealerId} preview /> : null}
            {tab === "access" ? (
              <div className="rounded-2xl border border-border p-6">
                <h3 className="text-xl font-semibold">Activate dealership access</h3>
                <p className="mt-3 text-sm">
                  This dealership already has an assigned account. Its private login is{" "}
                  <strong>{loginEmail}</strong>.
                </p>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">
                  <li>Open Bluebird’s sign-in page and enter that email.</li>
                  <li>
                    Choose the email sign-in link option and open the link from the dealership
                    inbox.
                  </li>
                  <li>
                    Open My account for dealership listings, messages, profile settings, and
                    performance.
                  </li>
                </ol>
                <p className="mt-4 text-xs text-muted-foreground">
                  The sign-in link confirms access to the assigned email. No separate claim or new
                  dealership account is needed. Your preview does not activate the account or send
                  any email.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/auth?redirect=${encodeURIComponent("/account?section=listings")}`,
                    );
                    setAccessStatus("Sign-in page link copied. No email has been sent.");
                  }}
                  className="mt-5 rounded-full border border-input px-4 py-2 text-sm font-semibold text-primary"
                >
                  Copy sign-in page link
                </button>
                <p role="status" className="mt-3 text-xs text-muted-foreground">
                  {accessStatus}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function DealerProfilePreview({ profile }: { profile: DealerProfileDraft }) {
  const [draft, setDraft] = useState(profile);
  return (
    <DealerProfileForm
      draft={draft}
      set={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
      preview
      lockSlug
    />
  );
}

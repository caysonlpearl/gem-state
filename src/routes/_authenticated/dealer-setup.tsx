import { DealerProfileForm } from "@/components/dealers/DealerProfileForm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import {
  addDealerMember,
  getDealerMembers,
  getDealerSetup,
  updateDealerMember,
} from "@/lib/dealer.functions";
import { saveDealerSetup } from "@/lib/dealer.functions";

export const Route = createFileRoute("/_authenticated/dealer-setup")({
  component: DealerSetupPage,
});

function DealerSetupPage() {
  const client = useQueryClient();
  const fetchSetup = useServerFn(getDealerSetup);
  const save = useServerFn(saveDealerSetup);
  const fetchMembers = useServerFn(getDealerMembers);
  const addMember = useServerFn(addDealerMember);
  const updateMember = useServerFn(updateDealerMember);
  const setup = useQuery({ queryKey: ["dealer-setup"], queryFn: () => fetchSetup() });
  const members = useQuery({
    queryKey: ["dealer-members", setup.data?.id],
    queryFn: () => fetchMembers({ data: { dealerId: setup.data!.id! } }),
    enabled: Boolean(setup.data?.id),
  });
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"manager" | "inventory">("inventory");
  useEffect(() => {
    if (!setup.data || draft) return;
    const d = setup.data;
    setDraft({
      legalName: d.legalName,
      displayName: d.displayName,
      slug: d.slug,
      phone: d.phone,
      email: d.email,
      website: d.website,
      addressLine1: d.addressLine1,
      addressLine2: d.addressLine2,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      logoUrl: d.logoUrl,
      description: d.description,
      acceptAgreements: d.agreementsAccepted,
      priceInsightsEnabled: d.priceInsightsEnabled,
      valuationDealerType: d.valuationDealerType ?? "",
    });
  }, [setup.data, draft]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          legalName: String(draft?.legalName ?? ""),
          displayName: String(draft?.displayName ?? ""),
          slug: String(draft?.slug ?? ""),
          phone: String(draft?.phone ?? "") || null,
          email: String(draft?.email ?? "") || null,
          website: String(draft?.website ?? "") || null,
          addressLine1: String(draft?.addressLine1 ?? "") || null,
          addressLine2: String(draft?.addressLine2 ?? "") || null,
          city: String(draft?.city ?? "") || null,
          state: String(draft?.state ?? "") || null,
          postalCode: String(draft?.postalCode ?? "") || null,
          logoUrl: String(draft?.logoUrl ?? "") || null,
          description: String(draft?.description ?? "") || null,
          acceptAgreements: Boolean(draft?.acceptAgreements),
          priceInsightsEnabled: draft?.priceInsightsEnabled !== false,
          valuationDealerType: (draft?.valuationDealerType || null) as
            "franchise" | "independent" | null,
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["dealer-setup"] });
      toast.success("Dealership profile saved and ready for inventory.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save dealership profile."),
  });
  const addMemberMutation = useMutation({
    mutationFn: () =>
      addMember({ data: { dealerId: setup.data!.id!, email: memberEmail, role: memberRole } }),
    onSuccess: async () => {
      setMemberEmail("");
      await client.invalidateQueries({ queryKey: ["dealer-members", setup.data?.id] });
      toast.success("Existing Bluebird member added to the dealership.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add dealership member."),
  });
  const updateMemberMutation = useMutation({
    mutationFn: (input: {
      userId: string;
      role?: "manager" | "inventory";
      status?: "active" | "disabled";
    }) => updateMember({ data: { dealerId: setup.data!.id!, ...input } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["dealer-members", setup.data?.id] });
      toast.success("Dealership member updated.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update dealership member."),
  });
  const set = (key: string, value: string | boolean) =>
    setDraft((current) => ({ ...(current ?? {}), [key]: value }));
  if (setup.error)
    return (
      <main className="mx-auto max-w-[940px] space-y-4 px-4 py-10">
        <h1 className="text-2xl font-semibold">Business profile</h1>
        <p role="alert" className="text-sm text-destructive">
          Your business profile could not be loaded. Please try again.
        </p>
        <button
          type="button"
          onClick={() => void setup.refetch()}
          className="rounded-full border border-input px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link to="/account" search={{ section: "listings" }} className="ml-4 text-sm text-primary">
          Back to listings
        </Link>
      </main>
    );
  if (!draft)
    return (
      <p className="mx-auto max-w-[940px] px-4 py-10 text-sm text-muted-foreground">
        Loading dealership setup…
      </p>
    );
  const readiness = setup.data?.readiness;
  return (
    <main className="mx-auto max-w-[940px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link to="/selling" className="text-[12px] text-muted-foreground hover:text-foreground">
          Back to seller center
        </Link>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Business tools
        </p>
        <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
          {setup.data?.exists ? "Edit business profile" : "Set up a dealership"}
        </h1>
        <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
          {setup.data?.exists
            ? "Manage your dealership’s name, logo, contact details, address, and price insights."
            : "Create your dealership storefront. Buyers will see this business profile on your vehicle listings."}
        </p>
      </div>
      <SellerCenterNav storefrontSlug={undefined} />
      <section className="grid gap-2 sm:grid-cols-4">
        {[
          ["Identity", readiness?.identity],
          ["Location", readiness?.location],
          ["Contact", readiness?.contact],
          ["Agreement", readiness?.agreements],
        ].map(([label, complete]) => (
          <div
            key={String(label)}
            className={`border p-3 text-[12px] ${complete ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
          >
            <span className="font-semibold">{complete ? "Ready" : "Needed"}</span>
            <span className="ml-2 text-muted-foreground">{label}</span>
          </div>
        ))}
      </section>
      <DealerProfileForm
        draft={draft}
        set={set}
        onSave={() => mutation.mutate()}
        saving={mutation.isPending}
        lockSlug={setup.data?.exists}
      />
      {setup.data?.exists ? (
        <p className="text-[12px] text-muted-foreground">
          Status: <span className="font-medium text-foreground">{setup.data.status}</span>.
          Inventory sources can now be associated with this dealership from the admin inventory
          workspace.
        </p>
      ) : null}
      {setup.data?.exists ? (
        <section className="space-y-4 border border-border bg-card p-5">
          <div>
            <h2 className="text-[16px] font-semibold">Staff access</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Add existing Bluebird members to help manage this dealership. Inventory staff can work
              feeds; managers can update dealership members.
            </p>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              addMemberMutation.mutate();
            }}
          >
            <input
              required
              type="email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="member@email.com"
              className="h-10 border border-input bg-background px-3 text-sm"
              aria-label="Existing member email"
            />
            <select
              value={memberRole}
              onChange={(event) => setMemberRole(event.target.value as "manager" | "inventory")}
              className="h-10 border border-input bg-background px-3 text-sm"
              aria-label="Member role"
            >
              <option value="inventory">Inventory staff</option>
              <option value="manager">Manager</option>
            </select>
            <button
              type="submit"
              disabled={addMemberMutation.isPending || !memberEmail.trim()}
              className="h-10 bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {addMemberMutation.isPending ? "Adding…" : "Add member"}
            </button>
          </form>
          {members.isLoading ? (
            <p className="text-[12px] text-muted-foreground">Loading staff…</p>
          ) : members.error ? (
            <p className="text-[12px] text-destructive">
              {members.error instanceof Error ? members.error.message : "Could not load staff."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[620px] text-left text-[12px]">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(members.data ?? []).map((member) => (
                    <tr key={member.user_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {member.display_name || member.email || member.user_id.slice(0, 8)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.email || "Email unavailable"}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {member.role === "owner" ? (
                          "Owner"
                        ) : (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              updateMemberMutation.mutate({
                                userId: member.user_id,
                                role: event.target.value as "manager" | "inventory",
                              })
                            }
                            className="h-8 border border-input bg-background px-2 text-[11px]"
                          >
                            <option value="inventory">Inventory staff</option>
                            <option value="manager">Manager</option>
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">{member.status}</td>
                      <td className="px-3 py-2">
                        {member.role !== "owner" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateMemberMutation.mutate({
                                userId: member.user_id,
                                status: member.status === "disabled" ? "active" : "disabled",
                              })
                            }
                            className="text-primary hover:underline"
                          >
                            {member.status === "disabled" ? "Reactivate" : "Disable"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">Primary owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { getDealerSetup, saveDealerSetup } from "@/lib/dealer.functions";

export const Route = createFileRoute("/_authenticated/dealer-setup")({ component: DealerSetupPage });

function DealerSetupPage() {
  const client = useQueryClient();
  const fetchSetup = useServerFn(getDealerSetup);
  const save = useServerFn(saveDealerSetup);
  const setup = useQuery({ queryKey: ["dealer-setup"], queryFn: () => fetchSetup() });
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);
  useEffect(() => {
    if (!setup.data || draft) return;
    const d = setup.data;
    setDraft({ legalName: d.legalName, displayName: d.displayName, slug: d.slug, phone: d.phone, email: d.email, website: d.website, addressLine1: d.addressLine1, addressLine2: d.addressLine2, city: d.city, state: d.state, postalCode: d.postalCode, logoUrl: d.logoUrl, description: d.description, acceptAgreements: d.agreementsAccepted });
  }, [setup.data, draft]);
  const mutation = useMutation({
    mutationFn: () => save({ data: {
      legalName: String(draft?.legalName ?? ""), displayName: String(draft?.displayName ?? ""), slug: String(draft?.slug ?? ""),
      phone: String(draft?.phone ?? "") || null, email: String(draft?.email ?? "") || null, website: String(draft?.website ?? "") || null,
      addressLine1: String(draft?.addressLine1 ?? "") || null, addressLine2: String(draft?.addressLine2 ?? "") || null, city: String(draft?.city ?? "") || null,
      state: String(draft?.state ?? "") || null, postalCode: String(draft?.postalCode ?? "") || null, logoUrl: String(draft?.logoUrl ?? "") || null,
      description: String(draft?.description ?? "") || null, acceptAgreements: Boolean(draft?.acceptAgreements),
    }}),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["dealer-setup"] }); toast.success("Dealership profile saved and ready for inventory."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save dealership profile."),
  });
  const set = (key: string, value: string | boolean) => setDraft((current) => ({ ...(current ?? {}), [key]: value }));
  if (!draft) return <p className="mx-auto max-w-[940px] px-4 py-10 text-sm text-muted-foreground">Loading dealership setup…</p>;
  const readiness = setup.data?.readiness;
  return <main className="mx-auto max-w-[940px] space-y-6 px-4 py-10 sm:px-6">
    <div><Link to="/selling" className="text-[12px] text-muted-foreground hover:text-foreground">Back to seller center</Link><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Business tools</p><h1 className="mt-1 text-[30px] font-semibold tracking-tight">Set up a dealership</h1><p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">This creates a business storefront and inventory identity separate from your individual seller profile. Buyers will see the dealership on linked vehicle listings.</p></div>
    <SellerCenterNav storefrontSlug={undefined} />
    <section className="grid gap-2 sm:grid-cols-4">{[["Identity", readiness?.identity], ["Location", readiness?.location], ["Contact", readiness?.contact], ["Agreement", readiness?.agreements]].map(([label, complete]) => <div key={String(label)} className={`border p-3 text-[12px] ${complete ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}><span className="font-semibold">{complete ? "Ready" : "Needed"}</span><span className="ml-2 text-muted-foreground">{label}</span></div>)}</section>
    <form className="space-y-5 border border-border bg-card p-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Legal business name" value={String(draft.legalName)} onChange={(v) => set("legalName", v)} required /><Field label="Public dealership name" value={String(draft.displayName)} onChange={(v) => set("displayName", v)} required /><Field label="Unique storefront slug" value={String(draft.slug)} onChange={(v) => set("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required /><Field label="Business phone" value={String(draft.phone)} onChange={(v) => set("phone", v)} /><Field label="Business email" value={String(draft.email)} onChange={(v) => set("email", v)} type="email" /><Field label="Website" value={String(draft.website)} onChange={(v) => set("website", v)} type="url" /><Field label="Address" value={String(draft.addressLine1)} onChange={(v) => set("addressLine1", v)} /><Field label="Suite / unit" value={String(draft.addressLine2)} onChange={(v) => set("addressLine2", v)} /><Field label="City" value={String(draft.city)} onChange={(v) => set("city", v)} /><Field label="State" value={String(draft.state)} onChange={(v) => set("state", v.toUpperCase())} /><Field label="ZIP code" value={String(draft.postalCode)} onChange={(v) => set("postalCode", v)} /><Field label="Logo URL" value={String(draft.logoUrl)} onChange={(v) => set("logoUrl", v)} type="url" /></div>
      <label className="block text-[12px] font-medium">Storefront description<textarea value={String(draft.description)} onChange={(e) => set("description", e.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="flex items-start gap-2 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground"><input type="checkbox" checked={Boolean(draft.acceptAgreements)} onChange={(e) => set("acceptAgreements", e.target.checked)} className="mt-0.5" /><span>I confirm this business identity and authorize Bluebird to display this storefront and its inventory.</span></label>
      <button type="submit" disabled={mutation.isPending || !draft.acceptAgreements} className="h-10 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Saving…" : "Save dealership setup"}</button>
    </form>
    {setup.data?.exists ? <p className="text-[12px] text-muted-foreground">Status: <span className="font-medium text-foreground">{setup.data.status}</span>. Inventory sources can now be associated with this dealership from the admin inventory workspace.</p> : null}
  </main>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block text-[12px] font-medium">{label}<input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm" /></label>; }

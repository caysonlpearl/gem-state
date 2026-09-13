import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera } from "@phosphor-icons/react";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { getSellerSetup, submitMissingProductListing } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/create-missing-listing")({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search["name"] === "string" ? search["name"].slice(0, 160) : undefined,
  }),
  component: CreateMissingListingPage,
});

const fieldClass =
  "mt-1.5 h-11 w-full border border-input bg-background px-3 text-[13px] outline-none focus:border-foreground";
const textareaClass =
  "mt-1.5 w-full border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground";
const conditionOptions = [
  ["new_with_tags", "New with tags"],
  ["new_without_tags", "New without tags"],
  ["used_excellent", "Used — excellent"],
  ["used_good", "Used — good"],
] as const;

function dollarsToCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

function CreateMissingListingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fetchFacets = useServerFn(getCatalogFacets);
  const fetchSetup = useServerFn(getSellerSetup);
  const submit = useServerFn(submitMissingProductListing);
  const facets = useQuery({ queryKey: ["catalog-facets"], queryFn: () => fetchFacets() });
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });

  const [form, setForm] = useState({
    name: search.name ?? "",
    brandText: "",
    collectionText: "",
    categoryId: "",
    resortCodes: [] as string[],
    proposedVariations: "",
    releaseNotes: "",
    price: "",
    condition: "new_with_tags",
    note: "",
    length: "",
    width: "",
    height: "",
    weight: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [photoRights, setPhotoRights] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!photoRights) throw new Error("Confirm that you can publish these exact-item photos.");
      if (files.length === 0) throw new Error("Add at least one exact-item photo.");
      if (!form.categoryId) throw new Error("Choose the closest category.");
      if (form.resortCodes.length === 0) throw new Error("Choose at least one park resort.");
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Sign in required.");

      const evidencePaths: string[] = [];
      const publicMediaPaths: string[] = [];
      for (const file of files.slice(0, 8)) {
        const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const fileId = crypto.randomUUID();
        const path = `${uid}/${fileId}.${ext}`;
        const evidence = await supabase.storage.from("ask-evidence").upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (evidence.error)
          throw new Error(`Private photo upload failed: ${evidence.error.message}`);
        const publicPhoto = await supabase.storage.from("listing-media").upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (publicPhoto.error)
          throw new Error(`Listing photo upload failed: ${publicPhoto.error.message}`);
        evidencePaths.push(path);
        publicMediaPaths.push(path);
      }

      return submit({
        data: {
          name: form.name,
          brandText: form.brandText,
          collectionText: form.collectionText,
          categoryId: form.categoryId,
          resortCodes: form.resortCodes,
          proposedVariations: form.proposedVariations,
          releaseNotes: form.releaseNotes,
          priceCents: dollarsToCents(form.price),
          itemCondition: form.condition,
          sellerNote: form.note,
          parcelLengthIn: form.length ? Number(form.length) : null,
          parcelWidthIn: form.width ? Number(form.width) : null,
          parcelHeightIn: form.height ? Number(form.height) : null,
          parcelWeightLb: form.weight ? Number(form.weight) : null,
          evidencePaths,
          publicMediaPaths,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Product request and exact-item listing sent together for ParkVault review.");
      await navigate({ to: "/selling" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit this listing."),
  });

  const profileReady = Boolean(
    setup.data?.exists &&
    setup.data?.termsAccepted &&
    setup.data?.stripeDetailsSubmitted &&
    setup.data?.stripePayoutsEnabled,
  );
  const geography = facets.data?.geography ?? [];
  const categories = facets.data?.categories ?? [];

  return (
    <main className="mx-auto max-w-[980px] px-4 py-10 sm:px-8">
      <Link
        to="/create-listing"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to product search
      </Link>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
        Seller center
      </p>
      <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
        Create a missing product listing
      </h1>
      <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-muted-foreground">
        Send the missing product page and your exact item as one request. ParkVault reviews the
        shared catalog page first, then the condition and photos before your listing can appear to
        buyers.
      </p>
      <SellerCenterNav storefrontSlug={setup.data?.slug} />

      {!setup.isLoading && !profileReady ? (
        <section className="mt-7 border border-brand-warm/40 bg-brand-warm/10 p-5">
          <p className="text-[13px] font-semibold">Complete seller setup first</p>
          <Link
            to="/seller-setup"
            className="mt-3 inline-flex h-10 items-center bg-primary px-4 text-[12px] font-semibold text-primary-foreground"
          >
            Open seller setup
          </Link>
        </section>
      ) : (
        <form
          className="mt-8 space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <section className="border border-border bg-card p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              1 · Missing product
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-[12px] font-medium">
                Product name as shown in park
                <input
                  className={fieldClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 160) })}
                  required
                  minLength={3}
                />
              </label>
              <label className="text-[12px] font-medium">
                Closest category
                <select
                  className={fieldClass}
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  required
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Variation you own
                <input
                  className={fieldClass}
                  placeholder="Standard, Adult XL, Limited Edition 500…"
                  value={form.proposedVariations}
                  onChange={(e) =>
                    setForm({ ...form, proposedVariations: e.target.value.slice(0, 600) })
                  }
                />
              </label>
              <label className="text-[12px] font-medium">
                Brand or maker (optional)
                <input
                  className={fieldClass}
                  value={form.brandText}
                  onChange={(e) => setForm({ ...form, brandText: e.target.value.slice(0, 120) })}
                />
              </label>
              <label className="text-[12px] font-medium">
                Collection or series (optional)
                <input
                  className={fieldClass}
                  value={form.collectionText}
                  onChange={(e) =>
                    setForm({ ...form, collectionText: e.target.value.slice(0, 120) })
                  }
                />
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-[12px] font-medium">Where this product was sold</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {geography.map((resort) => (
                    <label key={resort.resortId} className="flex items-center gap-2 text-[12.5px]">
                      <input
                        type="checkbox"
                        checked={form.resortCodes.includes(resort.resortCode)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            resortCodes: e.target.checked
                              ? [...form.resortCodes, resort.resortCode]
                              : form.resortCodes.filter((code) => code !== resort.resortCode),
                          })
                        }
                      />
                      {resort.resortName}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="sm:col-span-2 text-[12px] font-medium">
                Product or release details (optional)
                <textarea
                  rows={3}
                  className={textareaClass}
                  value={form.releaseNotes}
                  onChange={(e) => setForm({ ...form, releaseNotes: e.target.value.slice(0, 600) })}
                />
              </label>
            </div>
          </section>

          <section className="border border-border bg-card p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              2 · Your exact item
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-[12px] font-medium">
                Your listing price (USD)
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="75.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </label>
              <label className="text-[12px] font-medium">
                Condition
                <select
                  className={fieldClass}
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                >
                  {conditionOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 text-[12px] font-medium">
                Seller notes
                <textarea
                  rows={3}
                  className={textareaClass}
                  placeholder="Describe the exact condition, included pieces and any flaws."
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 500) })}
                />
              </label>
              <div className="sm:col-span-2">
                <label className="text-[12px] font-medium" htmlFor="missing-listing-photos">
                  Exact-item photos (1–8)
                </label>
                <label
                  htmlFor="missing-listing-photos"
                  className="mt-1.5 flex min-h-28 cursor-pointer items-center justify-center gap-2 border border-dashed border-input bg-secondary/35 px-4 text-[12px] font-medium hover:border-foreground"
                >
                  <Camera size={19} />{" "}
                  {files.length
                    ? `${files.length} photo${files.length === 1 ? "" : "s"} selected`
                    : "Choose photos"}
                </label>
                <input
                  id="missing-listing-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
                />
                {files.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {files.map((file) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="max-w-[180px] truncate border border-border px-2 py-1 text-[10.5px] text-muted-foreground"
                      >
                        {file.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              3 · Package
            </p>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Optional now. Add the packed dimensions if you know them; the default shipping method
              and handling time come from your seller profile.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["length", "Length (in)"],
                  ["width", "Width (in)"],
                  ["height", "Height (in)"],
                  ["weight", "Weight (lb)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-[12px] font-medium">
                  {label}
                  <input
                    className={fieldClass}
                    inputMode="decimal"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </section>

          <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={photoRights}
              onChange={(e) => setPhotoRights(e.target.checked)}
            />
            <span>
              I took these photos or have permission to publish them, and I authorize ParkVault to
              display them if this listing is approved.
            </span>
          </label>
          <button
            type="submit"
            disabled={mutation.isPending || setup.isLoading || !profileReady}
            className="h-12 bg-primary px-5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending
              ? "Sending product and listing…"
              : "Submit product and listing for review"}
          </button>
        </form>
      )}
    </main>
  );
}

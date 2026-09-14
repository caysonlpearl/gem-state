import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Camera, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { usStates, vehicleOptions } from "@/config/classifieds";
import { supabase } from "@/integrations/supabase/client";
import {
  getClassifiedCategoryOptions,
  getClassifiedListingEditor,
  type ClassifiedListingEditor,
  updateClassifiedListing,
} from "@/lib/classifieds.functions";
import { isMotorsCategory } from "@/lib/classifieds-display";
import { type ClassifiedListingInput } from "@/lib/classified-listing-contracts";

export const Route = createFileRoute("/_authenticated/listings/$listingId/edit")({
  component: ListingEditorPage,
});

const fieldClass =
  "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none focus:border-foreground";
const textareaClass =
  "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground";
const conditions = [
  ["new_with_tags", "New"],
  ["new_without_tags", "New, no tags"],
  ["used_excellent", "Used — excellent"],
  ["used_good", "Used — good"],
] as const;
const fulfillmentModes = [
  ["local_pickup", "Local pickup"],
  ["shipping", "Shipping"],
  ["both", "Pickup or shipping"],
] as const;

type EditForm = {
  title: string;
  description: string;
  category: string;
  price: string;
  condition: string;
  sellerNote: string;
  state: string;
  region: string;
  city: string;
  postalCode: string;
  fulfillmentMode: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  make: string;
  model: string;
  year: string;
  trim: string;
  mileage: string;
  bodyStyle: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  exteriorColor: string;
  titleStatus: string;
  vin: string;
};

const editorQuery = (listingId: string) =>
  queryOptions({
    queryKey: ["classified-listing-editor", listingId],
    queryFn: () => getClassifiedListingEditor({ data: { listingId } }),
  });

function fromListing(listing: ClassifiedListingEditor): EditForm {
  return {
    title: listing.title,
    description: listing.description,
    category: listing.category,
    price: (listing.priceCents / 100).toFixed(2),
    condition: listing.condition,
    sellerNote: listing.sellerNote,
    state: listing.state,
    region: listing.region,
    city: listing.city,
    postalCode: listing.postalCode,
    fulfillmentMode: listing.fulfillmentMode,
    length: listing.parcelLengthIn,
    width: listing.parcelWidthIn,
    height: listing.parcelHeightIn,
    weight: listing.parcelWeightLb,
    make: listing.vehicle?.make ?? "",
    model: listing.vehicle?.model ?? "",
    year: listing.vehicle?.year == null ? "" : String(listing.vehicle.year),
    trim: listing.vehicle?.trim ?? "",
    mileage: listing.vehicle?.mileage == null ? "" : String(listing.vehicle.mileage),
    bodyStyle: listing.vehicle?.bodyStyle ?? "",
    transmission: listing.vehicle?.transmission ?? "Automatic",
    drivetrain: listing.vehicle?.drivetrain ?? "",
    fuelType: listing.vehicle?.fuelType ?? "Gasoline",
    exteriorColor: listing.vehicle?.exteriorColor ?? "",
    titleStatus: listing.vehicle?.titleStatus ?? "Clean",
    vin: listing.vehicle?.vin ?? "",
  };
}

function numberOrNull(value: string) {
  return value.trim() ? Number(value) : null;
}

function ListingEditorPage() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchListing = useServerFn(getClassifiedListingEditor);
  const fetchCategories = useServerFn(getClassifiedCategoryOptions);
  const update = useServerFn(updateClassifiedListing);
  const listing = useQuery(editorQuery(listingId));
  const categories = useQuery({
    queryKey: ["classified-category-options"],
    queryFn: () => fetchCategories(),
  });
  const [form, setForm] = useState<EditForm | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rights, setRights] = useState(false);

  useEffect(() => {
    if (listing.data && !form) setForm(fromListing(listing.data));
  }, [listing.data, form]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form || !listing.data) throw new Error("Listing is still loading.");
      const publicMediaPaths: string[] = [];
      if (files.length > 0) {
        if (!rights)
          throw new Error("Confirm you have permission to publish the replacement photos.");
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        for (const file of files.slice(0, 8)) {
          const ext =
            file.name
              .split(".")
              .pop()
              ?.toLowerCase()
              .replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `${uid}/${crypto.randomUUID()}.${ext}`;
          const uploaded = await supabase.storage
            .from("listing-media")
            .upload(path, file, { contentType: file.type || "image/jpeg" });
          if (uploaded.error)
            throw new Error(`Listing photo upload failed: ${uploaded.error.message}`);
          publicMediaPaths.push(path);
        }
      }
      const vehicle: ClassifiedListingInput["vehicle"] = isMotorsCategory(form.category)
        ? {
            make: form.make,
            model: form.model,
            year: Number(form.year),
            trim: form.trim || undefined,
            mileage: Number(form.mileage),
            bodyStyle: form.bodyStyle as NonNullable<
              ClassifiedListingInput["vehicle"]
            >["bodyStyle"],
            transmission: form.transmission as NonNullable<
              ClassifiedListingInput["vehicle"]
            >["transmission"],
            drivetrain: form.drivetrain as NonNullable<
              ClassifiedListingInput["vehicle"]
            >["drivetrain"],
            fuelType: form.fuelType as NonNullable<ClassifiedListingInput["vehicle"]>["fuelType"],
            exteriorColor: form.exteriorColor || undefined,
            titleStatus: form.titleStatus as NonNullable<
              ClassifiedListingInput["vehicle"]
            >["titleStatus"],
            vin: form.vin || undefined,
          }
        : undefined;
      return update({
        data: {
          listingId,
          title: form.title,
          description: form.description,
          category: form.category as ClassifiedListingInput["category"],
          priceCents: Math.round(Number(form.price) * 100),
          condition: form.condition as ClassifiedListingInput["condition"],
          sellerNote: form.sellerNote,
          state: form.state,
          region: form.region,
          city: form.city,
          postalCode: form.postalCode || undefined,
          fulfillmentMode: form.fulfillmentMode as ClassifiedListingInput["fulfillmentMode"],
          parcelLengthIn: numberOrNull(form.length),
          parcelWidthIn: numberOrNull(form.width),
          parcelHeightIn: numberOrNull(form.height),
          parcelWeightLb: numberOrNull(form.weight),
          vehicle,
          publicMediaPaths,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["classified-listing-editor", listingId] });
      await queryClient.invalidateQueries({ queryKey: ["classified-browse"] });
      toast.success("Listing updated and submitted for Gem State review.");
      await navigate({ to: "/selling" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update listing."),
  });

  if (listing.isLoading || !form)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-12 text-[13px] text-muted-foreground">
        Loading listing…
      </main>
    );
  if (!listing.data)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-12">
        <h1 className="text-[20px] font-semibold">Listing not found</h1>
      </main>
    );

  const set = (key: keyof EditForm, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const vehicle = isMotorsCategory(form.category);

  return (
    <main className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <Link
        to="/selling"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Seller dashboard
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Gem State seller center
          </p>
          <h1 className="mt-1 font-editorial text-[36px] font-normal tracking-[-0.04em]">
            Edit listing
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Current price: {formatUsd(listing.data.priceCents)}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {listing.data.status === "active" && !listing.data.approvedAt
            ? "Awaiting review"
            : listing.data.status}
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="mt-7 space-y-6"
      >
        <section className="border border-border bg-card p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Item basics</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-[12px] font-medium">
              Title
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium">
              Price (USD)
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(event) => set("price", event.target.value)}
                className={`${fieldClass} numeric`}
              />
            </label>
            <label className="text-[12px] font-medium">
              Condition
              <select
                required
                value={form.condition}
                onChange={(event) => set("condition", event.target.value)}
                className={fieldClass}
              >
                {conditions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2 text-[12px] font-medium">
              Description
              <textarea
                required
                minLength={20}
                maxLength={5000}
                rows={6}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                className={textareaClass}
              />
            </label>
            <label className="sm:col-span-2 text-[12px] font-medium">
              Seller note
              <textarea
                maxLength={500}
                rows={3}
                value={form.sellerNote}
                onChange={(event) => set("sellerNote", event.target.value)}
                className={textareaClass}
              />
            </label>
          </div>
        </section>

        <section className="border border-border bg-card p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Category, location, and fulfillment</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[12px] font-medium">
              Category
              <select
                required
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                className={fieldClass}
              >
                <option value="">Choose a category</option>
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-medium">
              State
              <select
                required
                value={form.state}
                onChange={(event) => set("state", event.target.value)}
                className={fieldClass}
              >
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-medium">
              City
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.city}
                onChange={(event) => set("city", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium">
              Region / area
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.region}
                onChange={(event) => set("region", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium">
              ZIP code
              <input
                pattern="[0-9]{5}"
                maxLength={5}
                value={form.postalCode}
                onChange={(event) => set("postalCode", event.target.value.replace(/\D/g, ""))}
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium">
              Fulfillment
              <select
                required
                value={form.fulfillmentMode}
                onChange={(event) => set("fulfillmentMode", event.target.value)}
                className={fieldClass}
              >
                {fulfillmentModes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {vehicle && (
          <section className="border border-border bg-card p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">Vehicle details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[12px] font-medium">
                Make
                <input
                  required
                  value={form.make}
                  onChange={(event) => set("make", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Model
                <input
                  required
                  value={form.model}
                  onChange={(event) => set("model", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Year
                <input
                  required
                  type="number"
                  min="1900"
                  max="2100"
                  value={form.year}
                  onChange={(event) => set("year", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Trim
                <input
                  value={form.trim}
                  onChange={(event) => set("trim", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Mileage
                <input
                  required
                  type="number"
                  min="0"
                  max="2000000"
                  value={form.mileage}
                  onChange={(event) => set("mileage", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Body style
                <select
                  required
                  value={form.bodyStyle}
                  onChange={(event) => set("bodyStyle", event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Choose body style</option>
                  {vehicleOptions.bodyStyles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Drivetrain
                <select
                  required
                  value={form.drivetrain}
                  onChange={(event) => set("drivetrain", event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Choose drivetrain</option>
                  {vehicleOptions.drivetrains.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Transmission
                <select
                  required
                  value={form.transmission}
                  onChange={(event) => set("transmission", event.target.value)}
                  className={fieldClass}
                >
                  {vehicleOptions.transmissions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Fuel type
                <select
                  required
                  value={form.fuelType}
                  onChange={(event) => set("fuelType", event.target.value)}
                  className={fieldClass}
                >
                  {vehicleOptions.fuelTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Exterior color
                <select
                  value={form.exteriorColor}
                  onChange={(event) => set("exteriorColor", event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Choose color</option>
                  {vehicleOptions.exteriorColors.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Title status
                <select
                  required
                  value={form.titleStatus}
                  onChange={(event) => set("titleStatus", event.target.value)}
                  className={fieldClass}
                >
                  {vehicleOptions.titleStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                VIN
                <input
                  value={form.vin}
                  onChange={(event) => set("vin", event.target.value.toUpperCase())}
                  maxLength={17}
                  className={`${fieldClass} uppercase`}
                />
              </label>
            </div>
          </section>
        )}

        <section className="border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <h2 className="text-[15px] font-semibold">Photos</h2>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {listing.data.imageUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt="Current listing"
                className="h-24 w-24 shrink-0 bg-secondary object-contain"
              />
            ))}
          </div>
          <label className="mt-4 block text-[11.5px] text-muted-foreground">
            Replace all photos (optional)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 8))}
              className="mt-1 block text-[12px]"
            />
          </label>
          {files.length > 0 && (
            <label className="mt-3 flex items-start gap-2 text-[11.5px] text-muted-foreground">
              <input
                type="checkbox"
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
                className="mt-0.5"
              />
              I took these photos or have permission to publish them.
            </label>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["length", "Length (in)"],
              ["width", "Width (in)"],
              ["height", "Height (in)"],
              ["weight", "Weight (lb)"],
            ].map(([key, label]) => (
              <label key={key} className="text-[11px] text-muted-foreground">
                {label}
                <input
                  value={form[key as keyof EditForm]}
                  onChange={(event) => set(key as keyof EditForm, event.target.value)}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 border border-border bg-secondary/50 p-5">
          <div className="flex items-start gap-2">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="max-w-[650px] text-[11.5px] leading-relaxed text-muted-foreground">
              Saving changes sends the listing back through review before buyers see the updated
              information.
            </p>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || listing.data.status !== "active"}
            className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
            <ArrowRight size={15} />
          </button>
        </section>
      </form>
    </main>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Camera, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { idahoRegions, usStates, vehicleOptions } from "@/config/classifieds";
import { supabase } from "@/integrations/supabase/client";
import { createClassifiedListing, getClassifiedCategoryOptions } from "@/lib/classifieds.functions";
import { isMotorsCategory } from "@/lib/classifieds-display";
import { type ClassifiedListingInput } from "@/lib/classified-listing-contracts";
import { getSellerSetup } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/create-listing")({
  component: CreateListingPage,
});

const fieldClass =
  "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none focus:border-foreground";
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

type FormState = {
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

const initialForm: FormState = {
  title: "",
  description: "",
  category: "",
  price: "",
  condition: "used_good",
  sellerNote: "",
  state: "ID",
  region: "Treasure Valley",
  city: "",
  postalCode: "",
  fulfillmentMode: "local_pickup",
  length: "",
  width: "",
  height: "",
  weight: "",
  make: "",
  model: "",
  year: "",
  trim: "",
  mileage: "",
  bodyStyle: "",
  transmission: "Automatic",
  drivetrain: "",
  fuelType: "Gasoline",
  exteriorColor: "",
  titleStatus: "Clean",
  vin: "",
};

function dollarsToCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function CreateListingPage() {
  const navigate = useNavigate();
  const fetchSetup = useServerFn(getSellerSetup);
  const fetchCategories = useServerFn(getClassifiedCategoryOptions);
  const create = useServerFn(createClassifiedListing);
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });
  const categories = useQuery({
    queryKey: ["classified-category-options"],
    queryFn: () => fetchCategories(),
  });
  const [form, setForm] = useState<FormState>(initialForm);
  const [files, setFiles] = useState<File[]>([]);
  const [photoRights, setPhotoRights] = useState(false);

  const profileReady = Boolean(
    setup.data?.exists &&
    setup.data?.termsAccepted &&
    setup.data?.defaultShippingMethod &&
    setup.data?.defaultHandlingDays,
  );
  const isVehicle = isMotorsCategory(form.category);
  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!photoRights) throw new Error("Confirm that you can publish these photos.");
      if (files.length === 0) throw new Error("Add at least one listing photo.");
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
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
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

      const vehicle: ClassifiedListingInput["vehicle"] = isVehicle
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

      return create({
        data: {
          title: form.title,
          description: form.description,
          category: form.category as ClassifiedListingInput["category"],
          priceCents: dollarsToCents(form.price),
          condition: form.condition as ClassifiedListingInput["condition"],
          sellerNote: form.sellerNote || undefined,
          state: form.state,
          region: form.region,
          city: form.city,
          postalCode: form.postalCode || undefined,
          fulfillmentMode: form.fulfillmentMode as ClassifiedListingInput["fulfillmentMode"],
          parcelLengthIn: optionalNumber(form.length),
          parcelWidthIn: optionalNumber(form.width),
          parcelHeightIn: optionalNumber(form.height),
          parcelWeightLb: optionalNumber(form.weight),
          evidencePaths,
          publicMediaPaths,
          vehicle,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Listing submitted for Gem State review.");
      await navigate({ to: "/selling" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit this listing."),
  });

  if (!setup.isLoading && !profileReady) {
    return (
      <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
        <SellerCenterNav storefrontSlug={setup.data?.slug} />
        <section className="mt-8 border border-brand-warm/40 bg-brand-warm/10 p-6">
          <p className="text-[15px] font-semibold">Complete your seller profile first</p>
          <p className="mt-2 max-w-[640px] text-[12px] leading-relaxed text-muted-foreground">
            Add your seller profile and accept the seller agreement before creating a listing.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-11 items-center gap-2 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground"
          >
            Start seller setup <ArrowRight size={15} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <Link
        to="/selling"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Seller dashboard
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Gem State seller center
          </p>
          <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
            Create a listing
          </h1>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">
            List one exact item with your own photos, price, location, and details. Listings go
            through review before they appear to buyers.
          </p>
        </div>
      </div>
      <SellerCenterNav storefrontSlug={setup.data?.slug} />

      <form
        className="mt-8 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <section className="border border-border bg-card p-5 sm:p-6">
          <SectionHeading number="1" title="Item basics" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-[12px] font-medium">
              Title
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Example: 2019 Toyota Tacoma TRD Off-Road"
                className={fieldClass}
              />
            </label>
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
              Price (USD)
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(event) => set("price", event.target.value)}
                placeholder="0.00"
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
            <label className="text-[12px] font-medium sm:col-span-2">
              Description
              <textarea
                required
                minLength={20}
                maxLength={5000}
                rows={6}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Describe the item honestly, including known wear, included accessories, and anything a buyer should know."
                className={textareaClass}
              />
            </label>
            <label className="text-[12px] font-medium sm:col-span-2">
              Seller note <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                maxLength={500}
                rows={3}
                value={form.sellerNote}
                onChange={(event) => set("sellerNote", event.target.value)}
                placeholder="Pickup instructions or other private-to-buyer notes"
                className={textareaClass}
              />
            </label>
          </div>
        </section>

        <section className="border border-border bg-card p-5 sm:p-6">
          <SectionHeading number="2" title="Location and fulfillment" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                placeholder="Boise"
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
                placeholder="Treasure Valley or local area"
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium">
              ZIP code <span className="font-normal text-muted-foreground">(optional)</span>
              <input
                pattern="[0-9]{5}"
                maxLength={5}
                value={form.postalCode}
                onChange={(event) => set("postalCode", event.target.value.replace(/\D/g, ""))}
                placeholder="83702"
                className={fieldClass}
              />
            </label>
            <label className="text-[12px] font-medium sm:col-span-2">
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
          {form.state === "ID" && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Idaho region examples: {idahoRegions.join(", ")}.
            </p>
          )}
        </section>

        {isVehicle && (
          <section className="border border-border bg-card p-5 sm:p-6">
            <SectionHeading number="3" title="Vehicle details" />
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              These details power the car search filters and help buyers compare vehicles
              accurately.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[12px] font-medium">
                Make / brand
                <input
                  required
                  value={form.make}
                  onChange={(event) => set("make", event.target.value)}
                  placeholder="Toyota"
                  className={fieldClass}
                />
              </label>
              <label className="text-[12px] font-medium">
                Model
                <input
                  required
                  value={form.model}
                  onChange={(event) => set("model", event.target.value)}
                  placeholder="Tacoma"
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
                  placeholder="2019"
                  className={`${fieldClass} numeric`}
                />
              </label>
              <label className="text-[12px] font-medium">
                Trim <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  value={form.trim}
                  onChange={(event) => set("trim", event.target.value)}
                  placeholder="TRD Off-Road"
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
                  placeholder="85000"
                  className={`${fieldClass} numeric`}
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
                VIN <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  value={form.vin}
                  onChange={(event) => set("vin", event.target.value.toUpperCase())}
                  maxLength={17}
                  placeholder="17-character VIN"
                  className={`${fieldClass} uppercase`}
                />
              </label>
            </div>
          </section>
        )}

        <section className="border border-border bg-card p-5 sm:p-6">
          <SectionHeading number={isVehicle ? "4" : "3"} title="Photos and shipping details" />
          <label className="mt-4 flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-background px-4 text-center hover:border-primary">
            <Camera size={24} className="text-primary" />
            <span className="mt-2 text-[13px] font-semibold">Add up to 8 photos</span>
            <span className="mt-1 text-[11px] text-muted-foreground">
              Use clear photos of the exact item you are selling.
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 8))}
              className="sr-only"
            />
          </label>
          {files.length > 0 && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {files.length} photo{files.length === 1 ? "" : "s"} selected:{" "}
              {files.map((file) => file.name).join(", ")}
            </p>
          )}
          <label className="mt-4 flex items-start gap-2 text-[11.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={photoRights}
              onChange={(event) => setPhotoRights(event.target.checked)}
              className="mt-0.5"
            />
            I took these photos or have permission to publish them.
          </label>
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
                  value={form[key as keyof FormState]}
                  onChange={(event) => set(key as keyof FormState, event.target.value)}
                  inputMode="decimal"
                  className={`${fieldClass} numeric`}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 border border-border bg-secondary/50 p-5 sm:p-6">
          <div className="flex items-start gap-2">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="max-w-[650px] text-[11.5px] leading-relaxed text-muted-foreground">
              Your listing will be reviewed before going live. Buyers will see your title,
              description, photos, price, location, and published vehicle details.
            </p>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || categories.isLoading}
            className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Submitting…" : "Submit listing"}
            <ArrowRight size={15} />
          </button>
        </section>
      </form>
    </main>
  );
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {number}
      </span>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

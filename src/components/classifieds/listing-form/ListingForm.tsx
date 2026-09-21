import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Camera, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { classifiedCategories, idahoRegions, usStates } from "@/config/classifieds";
import { supabase } from "@/integrations/supabase/client";
import {
  createClassifiedListing,
  getClassifiedCategoryOptions,
  updateClassifiedListing,
  type ClassifiedListingEditor,
} from "@/lib/classifieds.functions";
import { isMotorsCategory } from "@/lib/classifieds-display";
import { type ClassifiedListingInput } from "@/lib/classified-listing-contracts";
import { HomeFields } from "./HomeFields";
import { JobFields } from "./JobFields";
import { ServiceFields } from "./ServiceFields";
import { PetFields } from "./PetFields";
import { VehicleFields } from "./VehicleFields";
import {
  buildHome,
  buildJob,
  buildService,
  buildPet,
  buildVehicle,
  fromEditor,
  isHomeCategory,
  isJobCategory,
  isServiceCategory,
  isPetCategory,
  kindForCategory,
  priceCentsFor,
  type ListingKind,
} from "./payload";
import { fieldClass, textareaClass } from "./shared";
import { initialListingForm, type ListingFormState } from "./types";

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
const kindTabs: { key: ListingKind; label: string }[] = [
  { key: "item", label: "Item" },
  { key: "vehicle", label: "Vehicle" },
  { key: "home", label: "Home" },
  { key: "job", label: "Job" },
  { key: "service", label: "Service" },
  { key: "pet", label: "Pet" },
];
const motorsCategorySlugs: Set<string> = new Set(
  classifiedCategories.filter((category) => category.group === "motors").map((c) => c.slug),
);
const itemCategorySlugs: Set<string> = new Set(
  classifiedCategories
    .filter(
      (category) =>
        category.group === "classifieds" &&
        !["other-real-estate", "jobs", "services", "pets"].includes(category.slug),
    )
    .map((c) => c.slug),
);

const listingTypeCopy: Record<
  ListingKind,
  {
    basicsTitle: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
  }
> = {
  item: {
    basicsTitle: "Item details",
    titlePlaceholder: "Example: Solid oak dining table",
    descriptionLabel: "Item description",
    descriptionPlaceholder:
      "Describe the item honestly, including condition, dimensions, and anything a buyer should know.",
  },
  vehicle: {
    basicsTitle: "Vehicle basics",
    titlePlaceholder: "Example: 2019 Toyota Tacoma TRD Off-Road",
    descriptionLabel: "Vehicle description",
    descriptionPlaceholder:
      "Describe the vehicle's condition, history, features, and anything a buyer should know.",
  },
  home: {
    basicsTitle: "Property basics",
    titlePlaceholder: "Example: 3-bedroom home with a fenced yard",
    descriptionLabel: "Property description",
    descriptionPlaceholder:
      "Describe the property, location, features, and anything a buyer or renter should know.",
  },
  job: {
    basicsTitle: "Job basics",
    titlePlaceholder: "Example: Front Desk Associate",
    descriptionLabel: "Job description",
    descriptionPlaceholder:
      "Describe the role, day-to-day work, schedule, and what makes this opportunity a good fit.",
  },
  service: {
    basicsTitle: "Service basics",
    titlePlaceholder: "Example: Boise Home Works | Handyman services",
    descriptionLabel: "Service description",
    descriptionPlaceholder:
      "Describe the service, what is included, where you work, and what customers should expect.",
  },
  pet: {
    basicsTitle: "Pet basics",
    titlePlaceholder: "Example: Golden Retriever puppies",
    descriptionLabel: "Pet description",
    descriptionPlaceholder:
      "Describe the animal honestly, including temperament, care needs, and anything a new home should know.",
  },
};

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

type ListingFormProps =
  | { mode: "create"; duplicateFrom?: ClassifiedListingEditor | undefined }
  | { mode: "edit"; listingId: string; initial: ClassifiedListingEditor; status: string };

export function ListingForm(props: ListingFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCategories = useServerFn(getClassifiedCategoryOptions);
  const create = useServerFn(createClassifiedListing);
  const update = useServerFn(updateClassifiedListing);
  const categories = useQuery({
    queryKey: ["classified-category-options"],
    queryFn: () => fetchCategories(),
  });

  const [form, setForm] = useState<ListingFormState>(() => {
    if (props.mode === "edit") return fromEditor(props.initial);
    return props.duplicateFrom ? fromEditor(props.duplicateFrom) : initialListingForm;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [photoRights, setPhotoRights] = useState(false);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [kind, setKind] = useState<ListingKind>(() => kindForCategory(form.category));

  const filePreviews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => {
    return () => {
      filePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

  function reorderFiles(from: number, to: number) {
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  useEffect(() => {
    if (props.mode === "edit") {
      setForm(fromEditor(props.initial));
      setKind(kindForCategory(props.initial.category));
    }
    // Only re-hydrate when switching to a different listing, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode === "edit" ? props.listingId : null]);

  const set = (key: keyof ListingFormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function selectKind(next: ListingKind) {
    setKind(next);
    if (next === "home") set("category", "other-real-estate");
    else if (next === "job") set("category", "jobs");
    else if (next === "service") set("category", "services");
    else if (next === "pet") set("category", "pets");
    else if (next === "vehicle" && !motorsCategorySlugs.has(form.category)) set("category", "");
    else if (next === "item" && !itemCategorySlugs.has(form.category)) set("category", "");
  }

  // Keep the selected tab authoritative while a user is choosing its category.
  // This lets the form become category-specific immediately instead of briefly
  // showing the generic item form after switching to Vehicle or Pet.
  const isVehicle = kind === "vehicle" || isMotorsCategory(form.category);
  const isHome = kind === "home" || isHomeCategory(form.category);
  const isJob = kind === "job" || isJobCategory(form.category);
  const isService = kind === "service" || isServiceCategory(form.category);
  const isPet = kind === "pet" || isPetCategory(form.category);
  const hasSpecialDetails = isVehicle || isHome || isJob || isService || isPet;
  const formCopy = listingTypeCopy[kind];
  const hidesCondition = isHome || isJob || isService;
  const hidesFulfillment = isHome || isJob || isService;
  const hidesPrice = isJob;

  const priceLabel = isHome
    ? form.homeMode === "rent"
      ? "Monthly rent (USD)"
      : "Sale price (USD)"
    : isService
      ? "Starting price or quote (USD)"
      : isPet
        ? "Price or adoption fee (USD)"
        : "Price (USD)";

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadNew = props.mode === "create" || files.length > 0;
      if (uploadNew) {
        if (props.mode === "create" && files.length === 0)
          throw new Error("Add at least one listing photo.");
        if (files.length > 0 && !photoRights)
          throw new Error("Confirm that you can publish these photos.");
      }

      const evidencePaths: string[] = [];
      const publicMediaPaths: string[] = [];
      if (files.length > 0) {
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
          if (props.mode === "create") {
            const evidence = await supabase.storage.from("ask-evidence").upload(path, file, {
              contentType: file.type || "image/jpeg",
            });
            if (evidence.error)
              throw new Error(`Private photo upload failed: ${evidence.error.message}`);
            evidencePaths.push(path);
          }
          const publicPhoto = await supabase.storage.from("listing-media").upload(path, file, {
            contentType: file.type || "image/jpeg",
          });
          if (publicPhoto.error)
            throw new Error(`Listing photo upload failed: ${publicPhoto.error.message}`);
          publicMediaPaths.push(path);
        }
      }

      const vehicle = buildVehicle(form);
      const home = buildHome(form);
      const job = buildJob(form);
      const service = buildService(form);
      const pet = buildPet(form);
      const priceCents = priceCentsFor(form);
      const condition = (
        hidesCondition ? "used_good" : form.condition
      ) as ClassifiedListingInput["condition"];
      const fulfillmentMode = (
        hidesFulfillment ? "local_pickup" : form.fulfillmentMode
      ) as ClassifiedListingInput["fulfillmentMode"];

      if (props.mode === "create") {
        return create({
          data: {
            title: form.title,
            description: form.description,
            category: form.category as ClassifiedListingInput["category"],
            priceCents,
            condition,
            sellerNote: form.sellerNote || undefined,
            state: form.state,
            region: form.region,
            city: form.city,
            postalCode: form.postalCode || undefined,
            fulfillmentMode,
            parcelLengthIn: optionalNumber(form.length),
            parcelWidthIn: optionalNumber(form.width),
            parcelHeightIn: optionalNumber(form.height),
            parcelWeightLb: optionalNumber(form.weight),
            evidencePaths,
            publicMediaPaths,
            vehicle,
            home,
            job,
            service,
            pet,
          },
        });
      }

      return update({
        data: {
          listingId: props.listingId,
          title: form.title,
          description: form.description,
          category: form.category as ClassifiedListingInput["category"],
          priceCents,
          condition,
          sellerNote: form.sellerNote || undefined,
          state: form.state,
          region: form.region,
          city: form.city,
          postalCode: form.postalCode || undefined,
          fulfillmentMode,
          parcelLengthIn: optionalNumber(form.length),
          parcelWidthIn: optionalNumber(form.width),
          parcelHeightIn: optionalNumber(form.height),
          parcelWeightLb: optionalNumber(form.weight),
          vehicle,
          home,
          job,
          service,
          pet,
          publicMediaPaths,
        },
      });
    },
    onSuccess: async () => {
      if (props.mode === "edit") {
        await queryClient.invalidateQueries({
          queryKey: ["classified-listing-editor", props.listingId],
        });
        await queryClient.invalidateQueries({ queryKey: ["classified-browse"] });
        toast.success("Listing updated and submitted for Gem State review.");
      } else {
        toast.success("Listing submitted for Gem State review.");
      }
      await navigate({ to: "/selling" });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : props.mode === "create"
            ? "Could not submit this listing."
            : "Could not update listing.",
      ),
  });

  const submitDisabled =
    mutation.isPending ||
    categories.isLoading ||
    (props.mode === "edit" && props.status !== "active");

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <section className="border border-border bg-card p-5 sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Listing type
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {kindTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectKind(tab.key)}
              aria-pressed={kind === tab.key}
              className={`h-10 rounded-full border px-4 text-[12.5px] font-semibold transition-colors ${
                kind === tab.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:border-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Choose what you're listing first -- the fields below change to match.
        </p>
      </section>

      <section className="border border-border bg-card p-5 sm:p-6">
        <SectionHeading number="1" title={formCopy.basicsTitle} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-[12px] font-medium">
            Title
            <input
              required
              minLength={3}
              maxLength={120}
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={formCopy.titlePlaceholder}
              className={fieldClass}
            />
          </label>
          {(kind === "item" || kind === "vehicle") && (
            <label className="text-[12px] font-medium">
              Category
              <select
                required
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                className={fieldClass}
              >
                <option value="">Choose a category</option>
                {(categories.data ?? [])
                  .filter((category) =>
                    kind === "vehicle"
                      ? motorsCategorySlugs.has(category.slug)
                      : itemCategorySlugs.has(category.slug),
                  )
                  .map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!hidesPrice && (
            <label className="text-[12px] font-medium">
              {priceLabel}{" "}
              {isPet && (
                <span className="font-normal text-muted-foreground">
                  (optional for free, wanted, or lost/found listings)
                </span>
              )}
              <input
                required={!isPet}
                inputMode="decimal"
                value={form.price}
                onChange={(event) => set("price", event.target.value)}
                placeholder={isPet ? "0.00 or leave blank for free" : "0.00"}
                className={`${fieldClass} numeric`}
              />
            </label>
          )}
          {!hidesCondition && (
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
          )}
          <label className="text-[12px] font-medium sm:col-span-2">
            {formCopy.descriptionLabel}
            <textarea
              required
              minLength={20}
              maxLength={5000}
              rows={6}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder={formCopy.descriptionPlaceholder}
              className={textareaClass}
            />
          </label>
          <label className="text-[12px] font-medium sm:col-span-2">
            Additional listing notes{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              maxLength={500}
              rows={3}
              value={form.sellerNote}
              onChange={(event) => set("sellerNote", event.target.value)}
              placeholder="Pickup instructions, scheduling details, or other notes for interested members"
              className={textareaClass}
            />
          </label>
        </div>
      </section>

      {hasSpecialDetails && (
        <section className="border border-border bg-card p-5 sm:p-6">
          <SectionHeading
            number="2"
            title={
              isVehicle
                ? "Vehicle details"
                : isHome
                  ? "Property details"
                  : isJob
                    ? "Job details"
                    : isService
                      ? "Service details"
                      : "Pet details"
            }
          />
          <div className="mt-4">
            {isVehicle && <VehicleFields form={form} set={set} />}
            {isHome && <HomeFields form={form} set={set} />}
            {isJob && <JobFields form={form} set={set} />}
            {isService && <ServiceFields form={form} set={set} />}
            {isPet && <PetFields form={form} set={set} />}
          </div>
        </section>
      )}

      <section className="border border-border bg-card p-5 sm:p-6">
        <SectionHeading number={hasSpecialDetails ? "3" : "2"} title="Location" />
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
          {!hidesFulfillment && (
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
          )}
        </div>
        {form.state === "ID" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Idaho region examples: {idahoRegions.join(", ")}.
          </p>
        )}
      </section>

      <section className="border border-border bg-card p-5 sm:p-6">
        <SectionHeading number={String((hasSpecialDetails ? 3 : 2) + 1)} title="Photos" />
        {props.mode === "edit" && props.initial.imageUrls.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {props.initial.imageUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt="Current listing"
                className="h-24 w-24 shrink-0 bg-secondary object-contain"
              />
            ))}
          </div>
        )}
        <label className="mt-4 flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-background px-4 text-center hover:border-primary">
          <Camera size={24} className="text-primary" />
          <span className="mt-2 text-[13px] font-semibold">
            {props.mode === "edit" ? "Replace all photos (optional)" : "Add up to 8 photos"}
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            Use clear photos of the exact listing.
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
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  draggable
                  onDragStart={() => setDraggedPhotoIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedPhotoIndex !== null && draggedPhotoIndex !== index)
                      reorderFiles(draggedPhotoIndex, index);
                    setDraggedPhotoIndex(null);
                  }}
                  onDragEnd={() => setDraggedPhotoIndex(null)}
                  className="relative h-20 w-20 shrink-0 cursor-move overflow-hidden rounded-md border border-border bg-secondary"
                >
                  <img
                    src={filePreviews[index]}
                    alt={file.name}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[9px] font-semibold text-white">
                    {index === 0 ? "Cover" : index + 1}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Drag photos to reorder. The first photo is the cover image.
            </p>
            <label className="mt-3 flex items-start gap-2 text-[11.5px] text-muted-foreground">
              <input
                type="checkbox"
                checked={photoRights}
                onChange={(event) => setPhotoRights(event.target.checked)}
                className="mt-0.5"
              />
              I took these photos or have permission to publish them.
            </label>
          </>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border border-border bg-secondary/50 p-5 sm:p-6">
        <div className="flex items-start gap-2">
          <CheckCircle size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="max-w-[650px] text-[11.5px] leading-relaxed text-muted-foreground">
            {props.mode === "edit"
              ? "Saving changes sends the listing back through review before buyers see the updated information."
              : "Your listing will be reviewed before going live. Buyers will see your title, description, photos, price, location, and published details."}
          </p>
        </div>
        <button
          type="submit"
          disabled={submitDisabled}
          className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending
            ? props.mode === "edit"
              ? "Saving…"
              : "Submitting…"
            : props.mode === "edit"
              ? "Save changes"
              : "Submit listing"}
          <ArrowRight size={15} />
        </button>
      </section>
    </form>
  );
}

export function ListingFormBackLink() {
  return (
    <Link
      to="/selling"
      className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={14} /> Seller dashboard
    </Link>
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

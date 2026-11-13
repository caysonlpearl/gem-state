import type { ReactNode } from "react";
import { ArrowRight, Camera, CheckCircle } from "@phosphor-icons/react";
import { idahoRegions, usStates } from "@/config/classifieds";
import { IdahoCityPicker } from "@/components/classifieds/IdahoCityPicker";
import { HomeFields } from "./HomeFields";
import { JobFields } from "./JobFields";
import { ServiceFields } from "./ServiceFields";
import { PetFields } from "./PetFields";
import { ItemFields } from "./ItemFields";
import { VehicleFields } from "./VehicleFields";
import {
  conditions,
  fulfillmentModes,
  kindTabs,
  motorsCategorySlugs,
  itemCategorySlugs,
} from "./model";
import { fieldClass, textareaClass } from "./shared";
import type { ListingFormProps } from "./props";
import type { useListingFormState } from "./useListingFormState";

export function ListingFormView({
  props,
  state,
  categories,
  categoriesLoading = false,
  mutation,
  vinLookup,
  error,
  locked = false,
  submitLabel,
  retainedPhotoCount = 0,
}: {
  props: ListingFormProps;
  state: ReturnType<typeof useListingFormState>;
  categories: readonly { id: string; slug: string; name: string }[];
  categoriesLoading?: boolean;
  mutation: { isPending: boolean; mutate: () => void };
  vinLookup: ReactNode;
  error?: string;
  locked?: boolean;
  submitLabel?: string;
  retainedPhotoCount?: number;
}) {
  const {
    form,
    set,
    files,
    setFiles,
    photoRights,
    setPhotoRights,
    draggedPhotoIndex,
    setDraggedPhotoIndex,
    kind,
    isIdaho,
    unknownIdahoCity,
    cityInput,
    cityLeft,
    setCityLeft,
    setCity,
    selectKind,
    isVehicle,
    isHome,
    isJob,
    isService,
    isPet,
    hasSpecialDetails,
    formCopy,
    hidesCondition,
    hidesFulfillment,
    hidesPrice,
    serviceIsQuote,
    priceLabel,
    filePreviews,
    reorderFiles,
  } = state;
  const submitDisabled =
    mutation.isPending || categoriesLoading || (props.mode === "edit" && props.status !== "active");

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <fieldset disabled={locked} className="block space-y-6 border-0 p-0">
        <legend className="sr-only">Listing details</legend>
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

        {isVehicle && vinLookup}

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
              <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
                <label className="text-[12px] font-medium">
                  Category
                  <select
                    required
                    value={form.category}
                    onChange={(event) => set("category", event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Choose a category</option>
                    {categories
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
              </div>
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
                  // The historical free-pet contract was required={!isPet}; quote-mode services are
                  // the second intentional exception because their amount is genuinely optional.
                  required={!isPet && !serviceIsQuote}
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value)}
                  placeholder={
                    isPet
                      ? "0.00 or leave blank for free"
                      : serviceIsQuote
                        ? "Leave blank for quote"
                        : "0.00"
                  }
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
              {isVehicle && (
                <div className="space-y-4">
                  <ItemFields
                    category={form.category}
                    details={form.itemDetails}
                    set={(key, value) => set("itemDetails", { ...form.itemDetails, [key]: value })}
                  />
                  <VehicleFields form={form} set={set} />
                </div>
              )}
              {isHome && <HomeFields form={form} set={set} />}
              {isJob && <JobFields form={form} set={set} />}
              {isService && <ServiceFields form={form} set={set} />}
              {isPet && <PetFields form={form} set={set} />}
            </div>
          </section>
        )}

        {kind === "item" && form.category && (
          <section className="border border-border bg-card p-5 sm:p-6">
            <SectionHeading number="2" title="Category details" />
            <p className="mt-1 text-[12px] text-muted-foreground">
              Add the structured facts buyers expect for this category. These values are saved with
              the listing and remain available when you edit it.
            </p>
            <div className="mt-4">
              <ItemFields
                category={form.category}
                details={form.itemDetails}
                set={(key, value) => set("itemDetails", { ...form.itemDetails, [key]: value })}
              />
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
              {isIdaho ? (
                <IdahoCityPicker
                  ref={cityInput}
                  required
                  value={form.city}
                  onChange={setCity}
                  invalid={unknownIdahoCity && cityLeft}
                  onBlur={() => setCityLeft(true)}
                  placeholder="Choose or type your city"
                  className={fieldClass}
                />
              ) : (
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City"
                  className={fieldClass}
                />
              )}
              {unknownIdahoCity && cityLeft && (
                <span className="mt-1 block text-[11px] font-normal text-destructive">
                  Pick your city from the list. If your town isn&apos;t listed, choose the nearest
                  one.
                </span>
              )}
            </label>
            <label className="text-[12px] font-medium">
              Region / area
              {isIdaho ? (
                <select
                  required
                  value={form.region}
                  onChange={(event) => set("region", event.target.value)}
                  className={fieldClass}
                >
                  {!idahoRegions.some((region) => region === form.region) && (
                    <option value={form.region}>{form.region || "Choose a region"}</option>
                  )}
                  {idahoRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.region}
                  onChange={(event) => set("region", event.target.value)}
                  placeholder="Local area"
                  className={fieldClass}
                />
              )}
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
          {isIdaho && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              The region fills in from your city.
            </p>
          )}
        </section>

        {props.mode === "create" && props.duplicateFrom ? (
          <section className="border border-amber-300 bg-amber-50 p-4 text-[12px] leading-relaxed text-amber-950">
            <p className="font-semibold">Duplicate started from an existing listing</p>
            <p className="mt-1">
              Your listing details were copied, but the original photos are not copied
              automatically. Add at least one photo of the exact item and confirm you have
              permission to publish it before submitting.
            </p>
          </section>
        ) : null}

        <section className="border border-border bg-card p-5 sm:p-6">
          <SectionHeading number={String((hasSpecialDetails ? 3 : 2) + 1)} title="Photos" />
          {retainedPhotoCount > 0 && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {retainedPhotoCount} photos uploaded for this submission.
            </p>
          )}
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
      </fieldset>
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
            : (submitLabel ?? (props.mode === "edit" ? "Save changes" : "Submit listing"))}
          <ArrowRight size={15} />
        </button>
      </section>
    </form>
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

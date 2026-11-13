import { DealerLogo } from "./DealerLogo";

export type DealerProfileDraft = Record<string, string | boolean>;

/** Shared by the dealer editor and administrator preview; previews never save. */
export function DealerProfileForm({
  draft,
  set,
  onSave,
  saving = false,
  preview = false,
  lockSlug = false,
}: {
  draft: DealerProfileDraft;
  set: (key: string, value: string | boolean) => void;
  onSave?: () => void;
  saving?: boolean;
  preview?: boolean;
  lockSlug?: boolean;
}) {
  return (
    <form
      aria-label="Dealership business profile"
      className="space-y-5 border border-border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!preview) onSave?.();
      }}
    >
      {preview ? (
        <p className="text-xs text-muted-foreground">
          Preview only. You can try these fields; changes are not saved and no agreements are
          submitted.
        </p>
      ) : null}
      <div className="space-y-2">
        <p className="text-xs font-medium">Dealership logo preview</p>
        <DealerLogo
          src={String(draft.logoUrl ?? "")}
          name={String(draft.displayName || "Dealership")}
          className="h-16 w-56 object-contain object-left"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Legal business name"
          value={String(draft.legalName)}
          onChange={(v) => set("legalName", v)}
          required
        />
        <Field
          label="Public dealership name"
          value={String(draft.displayName)}
          onChange={(v) => set("displayName", v)}
          required
        />
        <Field
          label="Unique storefront slug"
          disabled={lockSlug}
          value={String(draft.slug)}
          onChange={(v) => set("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          required
        />
        <Field
          label="Business phone"
          value={String(draft.phone)}
          onChange={(v) => set("phone", v)}
        />
        <Field
          label="Business email"
          value={String(draft.email)}
          onChange={(v) => set("email", v)}
          type="email"
        />
        <Field
          label="Website"
          value={String(draft.website)}
          onChange={(v) => set("website", v)}
          type="url"
        />
        <Field
          label="Address"
          value={String(draft.addressLine1)}
          onChange={(v) => set("addressLine1", v)}
        />
        <Field
          label="Suite / unit"
          value={String(draft.addressLine2)}
          onChange={(v) => set("addressLine2", v)}
        />
        <Field label="City" value={String(draft.city)} onChange={(v) => set("city", v)} />
        <Field
          label="State"
          value={String(draft.state)}
          onChange={(v) => set("state", v.toUpperCase())}
          placeholder="ID or Idaho"
        />
        <Field
          label="ZIP code"
          value={String(draft.postalCode)}
          onChange={(v) => set("postalCode", v)}
        />
        <Field
          label="Logo URL"
          value={String(draft.logoUrl)}
          onChange={(v) => set("logoUrl", v)}
          type="url"
        />
      </div>
      <label className="block text-[12px] font-medium">
        Storefront description
        <textarea
          value={String(draft.description)}
          onChange={(e) => set("description", e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-[14px] font-semibold">Price insights</span>
            <span className="mt-1 block max-w-[620px] text-[12px] leading-relaxed text-muted-foreground">
              Show buyers an independent estimated market price on eligible vehicle listings.
              Enabled by default. You can turn this off for your entire dealership.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Show price insights on dealership listings"
            checked={draft.priceInsightsEnabled !== false}
            onChange={(e) => set("priceInsightsEnabled", e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
          />
        </label>
        <label className="mt-4 block text-[12px] font-medium">
          Dealership type
          <select
            value={String(draft.valuationDealerType ?? "")}
            onChange={(e) => set("valuationDealerType", e.target.value)}
            className="ml-3 rounded-lg border border-input bg-background px-3 py-2"
          >
            <option value="">Select type</option>
            <option value="franchise">Manufacturer franchise</option>
            <option value="independent">Independent dealership</option>
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={Boolean(draft.acceptAgreements)}
          onChange={(e) => set("acceptAgreements", e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I confirm this business identity and authorize Bluebird to display this storefront and its
          inventory.
        </span>
      </label>
      <button
        type="submit"
        disabled={preview || saving || !draft.acceptAgreements}
        className="h-10 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save business profile"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-[12px] font-medium">
      {label}
      <input
        required={required}
        disabled={disabled}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

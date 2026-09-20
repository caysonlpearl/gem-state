import { fieldClass, textareaClass } from "./shared";
import type { ListingFormState } from "./types";

export function ServiceFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-[12px] font-medium">
        Subcategory
        <input
          required
          value={form.subcategory}
          onChange={(event) => set("subcategory", event.target.value)}
          placeholder="Handyman"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Service area
        <input
          required
          value={form.serviceArea}
          onChange={(event) => set("serviceArea", event.target.value)}
          placeholder="Boise, Meridian, Eagle"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Availability <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.availability}
          onChange={(event) => set("availability", event.target.value)}
          placeholder="Weekday and Saturday appointments"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Business address <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.businessAddress}
          onChange={(event) => set("businessAddress", event.target.value)}
          placeholder="4210 W Home Works Way, Boise, ID 83704"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Business license number{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.licenseNumber}
          onChange={(event) => set("licenseNumber", event.target.value)}
          placeholder="RCE-45892"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        License lookup URL <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          type="url"
          value={form.licenseLookupUrl}
          onChange={(event) => set("licenseLookupUrl", event.target.value)}
          placeholder="https://dopl.idaho.gov"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium sm:col-span-2">
        What's included <span className="font-normal text-muted-foreground">(one per line)</span>
        <textarea
          rows={4}
          value={form.offerings}
          onChange={(event) => set("offerings", event.target.value)}
          placeholder={
            "Drywall patching and texture matching\nTrim, doors, and hardware installation"
          }
          className={textareaClass}
        />
      </label>
    </div>
  );
}

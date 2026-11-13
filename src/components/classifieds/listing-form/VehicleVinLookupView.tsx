import { fieldClass } from "./shared";
import type { ListingFormState } from "./types";

export function VehicleVinLookupView({
  form,
  set,
  isPending,
  decode,
  error,
  notice,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
  isPending: boolean;
  decode: () => void;
  error?: string;
  notice?: string;
}) {
  return (
    <section className="border border-primary/30 bg-primary/5 p-5 sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
        Start with the VIN
      </p>
      <h2 className="mt-2 text-lg font-semibold">
        Let Bluebird Marketplace fill in the vehicle details
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
        Enter the 17-character VIN and we’ll look up the year, make, model, trim, body style,
        drivetrain, transmission, fuel type, and any other details available from the NHTSA vehicle
        database. Everything stays editable before you publish.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-primary">
          {notice}
        </p>
      )}
      <label className="mt-4 block max-w-3xl text-[12px] font-medium">
        VIN
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            value={form.vin}
            onChange={(event) => set("vin", event.target.value.replace(/[\s-]/g, "").toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter" && form.vin.trim().length === 17 && !isPending) {
                event.preventDefault();
                decode();
              }
            }}
            maxLength={17}
            placeholder="Enter 17-character VIN"
            autoComplete="off"
            className={`${fieldClass} mt-0 min-w-0 flex-1 uppercase`}
          />
          <button
            type="button"
            onClick={() => decode()}
            disabled={isPending || form.vin.trim().length !== 17}
            className="h-11 shrink-0 rounded-md bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Looking up VIN…" : "Auto-fill details"}
          </button>
        </div>
        <span className="mt-2 block text-[11px] font-normal text-muted-foreground">
          VINs use 17 characters and do not contain I, O, or Q. Don’t have the VIN? That’s okay —
          you can enter the vehicle details manually below.
        </span>
      </label>
    </section>
  );
}

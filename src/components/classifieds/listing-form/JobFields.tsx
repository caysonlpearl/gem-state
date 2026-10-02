import { fieldClass, textareaClass } from "./shared";
import type { ListingFormState } from "./types";

const payTypes = ["Hourly", "Salary", "Commission", "Contract"] as const;
const employmentTypes = ["Full-time", "Part-time", "Seasonal", "Contract", "Temporary"] as const;

export function JobFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-[12px] font-medium">
        Employer name
        <input
          required
          value={form.employerName}
          onChange={(event) => set("employerName", event.target.value)}
          placeholder="Twilite Lounge"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Employer address <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.employerAddress}
          onChange={(event) => set("employerAddress", event.target.value)}
          placeholder="Boise, ID 83702"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Pay type
        <select
          required
          value={form.payType}
          onChange={(event) => set("payType", event.target.value)}
          className={fieldClass}
        >
          {payTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Employment type
        <select
          required
          value={form.employmentType}
          onChange={(event) => set("employmentType", event.target.value)}
          className={fieldClass}
        >
          {employmentTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-medium">
        Pay minimum ({form.payType === "Salary" ? "$/yr" : "$/hr"})
        <input
          required
          inputMode="decimal"
          value={form.payMin}
          onChange={(event) => set("payMin", event.target.value)}
          placeholder={form.payType === "Salary" ? "38000" : "16"}
          className={`${fieldClass} numeric`}
        />
      </label>
      <label className="text-[12px] font-medium">
        Pay maximum ({form.payType === "Salary" ? "$/yr" : "$/hr"})
        <input
          required
          inputMode="decimal"
          value={form.payMax}
          onChange={(event) => set("payMax", event.target.value)}
          placeholder={form.payType === "Salary" ? "44000" : "21"}
          className={`${fieldClass} numeric`}
        />
      </label>
      <label className="text-[12px] font-medium">
        Experience required <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.experienceRequired}
          onChange={(event) => set("experienceRequired", event.target.value)}
          placeholder="1+ years"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium">
        Education level <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={form.educationLevel}
          onChange={(event) => set("educationLevel", event.target.value)}
          placeholder="High school diploma"
          className={fieldClass}
        />
      </label>
      <label className="text-[12px] font-medium sm:col-span-2">
        Responsibilities <span className="font-normal text-muted-foreground">(one per line)</span>
        <textarea
          rows={4}
          value={form.responsibilities}
          onChange={(event) => set("responsibilities", event.target.value)}
          placeholder={"Greet patients and manage check-in\nSchedule and confirm appointments"}
          className={textareaClass}
        />
      </label>
      <label className="text-[12px] font-medium sm:col-span-2">
        Qualifications{" "}
        <span className="font-normal text-muted-foreground">(optional, one per line)</span>
        <textarea
          rows={3}
          value={form.qualifications}
          onChange={(event) => set("qualifications", event.target.value)}
          placeholder="Comfortable with scheduling software"
          className={textareaClass}
        />
      </label>
      <div className="sm:col-span-2 border-t border-border pt-4">
        <p className="text-[12px] font-medium">How should applicants apply?</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => set("applicationMethod", "gemlist")}
            aria-pressed={form.applicationMethod === "gemlist"}
            className={`h-10 rounded-full border px-4 text-[12.5px] font-semibold transition-colors ${
              form.applicationMethod === "gemlist"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:border-primary"
            }`}
          >
            Apply through Gem State
          </button>
          <button
            type="button"
            onClick={() => set("applicationMethod", "external")}
            aria-pressed={form.applicationMethod === "external"}
            className={`h-10 rounded-full border px-4 text-[12.5px] font-semibold transition-colors ${
              form.applicationMethod === "external"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:border-primary"
            }`}
          >
            Apply elsewhere
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {form.applicationMethod === "gemlist"
            ? "Applicants upload a resume and optional cover letter here. You'll review them in your seller dashboard."
            : "Applicants are sent to a link or email address you provide instead."}
        </p>
        {form.applicationMethod === "external" && (
          <label className="mt-3 block text-[12px] font-medium">
            Application link or email
            <input
              required
              value={form.applicationExternalContact}
              onChange={(event) => set("applicationExternalContact", event.target.value)}
              placeholder="https://example.com/careers or jobs@example.com"
              className={fieldClass}
            />
          </label>
        )}
      </div>
    </div>
  );
}

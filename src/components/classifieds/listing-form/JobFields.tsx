import { fieldClass, textareaClass } from "./shared";
import type { ListingFormState } from "./types";

const payTypes = ["Hourly", "Salary", "Commission", "Contract"] as const;
const employmentTypes = ["Full-time", "Part-time", "Seasonal", "Contract", "Temporary"] as const;
const jobCategories = [
  "Accounting & Finance",
  "Administrative",
  "Architecture & Engineering",
  "Automotive",
  "Construction",
  "Education",
  "Healthcare",
  "Hospitality",
  "Human Resources",
  "Information Technology",
  "Retail",
  "Other",
] as const;

const compensationCopy = {
  Hourly: {
    minimum: "Minimum hourly pay ($/hr)",
    maximum: "Maximum hourly pay ($/hr)",
    minimumPlaceholder: "16",
    maximumPlaceholder: "21",
    hint: "Enter the hourly range for this role.",
    max: undefined,
  },
  Salary: {
    minimum: "Minimum annual salary ($/yr)",
    maximum: "Maximum annual salary ($/yr)",
    minimumPlaceholder: "38000",
    maximumPlaceholder: "44000",
    hint: "Enter the annual salary range for this role.",
    max: undefined,
  },
  Commission: {
    minimum: "Minimum commission (%)",
    maximum: "Maximum commission (%)",
    minimumPlaceholder: "5",
    maximumPlaceholder: "10",
    hint: "Enter the commission percentage range.",
    max: "100",
  },
  Contract: {
    minimum: "Minimum contract amount ($)",
    maximum: "Maximum contract amount ($)",
    minimumPlaceholder: "1500",
    maximumPlaceholder: "3000",
    hint: "Enter the expected total contract amount range.",
    max: undefined,
  },
} as const;

export function JobFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  const payCopy =
    compensationCopy[form.payType as keyof typeof compensationCopy] ?? compensationCopy.Hourly;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-[12px] font-medium">
        Job category
        <select
          required
          value={form.jobCategory}
          onChange={(event) => set("jobCategory", event.target.value)}
          className={fieldClass}
        >
          {jobCategories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
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
        {payCopy.minimum}
        <input
          required
          inputMode="decimal"
          min="0"
          max={payCopy.max}
          value={form.payMin}
          onChange={(event) => set("payMin", event.target.value)}
          placeholder={payCopy.minimumPlaceholder}
          className={`${fieldClass} numeric`}
        />
      </label>
      <label className="text-[12px] font-medium">
        {payCopy.maximum}
        <input
          required
          inputMode="decimal"
          min="0"
          max={payCopy.max}
          value={form.payMax}
          onChange={(event) => set("payMax", event.target.value)}
          placeholder={payCopy.maximumPlaceholder}
          className={`${fieldClass} numeric`}
        />
      </label>
      <p className="text-[11px] text-muted-foreground sm:col-span-2">{payCopy.hint}</p>
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
    </div>
  );
}

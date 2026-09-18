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
    </div>
  );
}

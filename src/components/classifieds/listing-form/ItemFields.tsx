import { fieldsForClassifiedItem, type ClassifiedItemField } from "@/config/classified-item-fields";
import { fieldClass } from "./shared";

export function ItemFields({
  category,
  details,
  set,
}: {
  category: string;
  details: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  const fields = fieldsForClassifiedItem(category);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <ItemField key={field.key} field={field} value={details[field.key] ?? ""} set={set} />
      ))}
    </div>
  );
}

function ItemField({
  field,
  value,
  set,
}: {
  field: ClassifiedItemField;
  value: string;
  set: (key: string, value: string) => void;
}) {
  return (
    <label className="text-[12px] font-medium">
      {field.label}{" "}
      {!field.required && <span className="font-normal text-muted-foreground">(optional)</span>}
      {field.options ? (
        <select
          required={field.required}
          value={value}
          onChange={(event) => set(field.key, event.target.value)}
          className={fieldClass}
        >
          <option value="">Choose an option</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          required={field.required}
          value={value}
          onChange={(event) => set(field.key, event.target.value)}
          placeholder={field.placeholder}
          maxLength={200}
          className={fieldClass}
        />
      )}
    </label>
  );
}

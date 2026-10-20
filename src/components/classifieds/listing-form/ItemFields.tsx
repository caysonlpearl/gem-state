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
  const visibleFields =
    category === "firearms"
      ? fields.filter((field) => {
          if (field.key === "accessoryType") return details.listingType === "Accessory";
          if (field.key === "firearmType" || field.key === "caliber")
            return details.listingType !== "Accessory";
          return true;
        })
      : fields;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleFields.map((field) => (
        <ItemField
          key={field.key}
          field={{
            ...field,
            required:
              field.required ||
              (category === "firearms" &&
                ((field.key === "firearmType" && details.listingType !== "Accessory") ||
                  (field.key === "accessoryType" && details.listingType === "Accessory"))),
          }}
          value={details[field.key] ?? ""}
          set={(key, value) => {
            set(key, value);
            if (category === "firearms" && key === "listingType") {
              set(value === "Accessory" ? "firearmType" : "accessoryType", "");
              if (value === "Accessory") set("caliber", "");
            }
          }}
        />
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
          {value && !field.options.includes(value) && <option value={value}>{value}</option>}
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

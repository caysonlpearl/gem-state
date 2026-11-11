import { suggestLocations } from "@/lib/location-suggest";

/** Native dropdown of city/ZIP suggestions for a location input's `list`. */
export function LocationOptions({ id, query }: { id: string; query: string }) {
  return (
    <datalist id={id}>
      {suggestLocations(query, 12).map((option) => (
        <option key={option.value} value={option.value} label={option.label} />
      ))}
    </datalist>
  );
}

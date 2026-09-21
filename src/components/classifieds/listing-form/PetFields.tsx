import {
  petBreedsBySpecies,
  petIndoorOutdoor,
  petOfferedBy,
  petPlacementTypes,
  petSexes,
  petSpecies,
  petSubcategoryForSelection,
  petYesNoUnknown,
} from "@/config/pets";
import { fieldClass, textareaClass } from "./shared";
import type { ListingFormState } from "./types";

export function PetFields({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  const breeds = petBreedsBySpecies[form.petSpecies] ?? petBreedsBySpecies["Other"]!;
  const isBreeding = form.petPlacementType === "stud_breeding";
  const isRecovery = form.petPlacementType === "lost_found";
  const isWanted = form.petPlacementType === "wanted";

  function syncPetClassification(species: string, placementType = form.petPlacementType) {
    set("petSubcategory", petSubcategoryForSelection(species, placementType));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[12px] font-medium">
          Listing intent
          <select
            required
            value={form.petPlacementType}
            onChange={(event) => {
              const placementType = event.target.value;
              set("petPlacementType", placementType);
              syncPetClassification(form.petSpecies, placementType);
            }}
            className={fieldClass}
          >
            {petPlacementTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Species
          <select
            required
            value={form.petSpecies}
            onChange={(event) => {
              const species = event.target.value;
              set("petSpecies", species);
              syncPetClassification(species);
              set("petBreed", "");
            }}
            className={fieldClass}
          >
            {petSpecies.map((species) => (
              <option key={species} value={species}>
                {species}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Breed / variety
          <select
            required={!isRecovery && !isWanted}
            value={form.petBreed}
            onChange={(event) => set("petBreed", event.target.value)}
            className={fieldClass}
          >
            <option value="">Choose a breed or variety</option>
            {form.petBreed && !breeds.includes(form.petBreed) && (
              <option value={form.petBreed}>{form.petBreed} (custom)</option>
            )}
            {breeds.map((breed) => (
              <option key={breed} value={breed}>
                {breed}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Pet name <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.petName}
            onChange={(event) => set("petName", event.target.value)}
            placeholder="Maple"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Age or birth date <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            value={form.petAge}
            onChange={(event) => set("petAge", event.target.value)}
            placeholder="10 months"
            className={fieldClass}
          />
        </label>
        <label className="text-[12px] font-medium">
          Sex
          <select
            value={form.petSex}
            onChange={(event) => set("petSex", event.target.value)}
            className={fieldClass}
          >
            {petSexes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Offered by
          <select
            value={form.petOfferedBy}
            onChange={(event) => set("petOfferedBy", event.target.value)}
            className={fieldClass}
          >
            {petOfferedBy.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Living arrangement
          <select
            value={form.petIndoorOutdoor}
            onChange={(event) => set("petIndoorOutdoor", event.target.value)}
            className={fieldClass}
          >
            {petIndoorOutdoor.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isRecovery && !isWanted && (
        <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["petHypoallergenic", "Hypoallergenic"],
            ["petVaccinated", "Vaccinated"],
            ["petSpayedNeutered", "Spayed / neutered"],
            ["petMicrochipped", "Microchipped"],
            ["petRecordsAvailable", "Records available"],
            ["petGoodWithKids", "Good with children"],
            ["petGoodWithDogs", "Good with dogs"],
            ["petGoodWithCats", "Good with cats"],
          ].map(([key, label]) => (
            <label key={key} className="text-[12px] font-medium">
              {label}
              <select
                value={form[key as keyof ListingFormState] as string}
                onChange={(event) => set(key as keyof ListingFormState, event.target.value)}
                className={fieldClass}
              >
                {petYesNoUnknown.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2">
        <label className="text-[12px] font-medium sm:col-span-2">
          {isBreeding
            ? "Breeding terms and health/genetic testing"
            : "Special needs or care requirements"}
          <textarea
            value={isBreeding ? form.petBreedingTerms : form.petSpecialNeeds}
            onChange={(event) =>
              set(isBreeding ? "petBreedingTerms" : "petSpecialNeeds", event.target.value)
            }
            rows={4}
            maxLength={1000}
            placeholder={
              isBreeding
                ? "Explain terms, testing, registration, and availability."
                : "Share care needs, temperament notes, and anything a new home should know."
            }
            className={textareaClass}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
          GemList does not verify health, ownership, breed, or seller claims. Keep records private
          until you have independently verified the animal and seller.
        </p>
      </div>
    </div>
  );
}

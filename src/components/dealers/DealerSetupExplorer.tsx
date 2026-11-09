import { ArrowRight, Check } from "lucide-react";
export type DealerSetupDraft = { provider: string; inventoryCount: string };
const sources = [
  {
    value: "Inventory provider / feed",
    label: "An inventory provider",
    guidance:
      "We’ll start with your provider’s feed or export options, confirm what’s available, and review how your vehicle details and photos can be brought into Bluebird.",
  },
  {
    value: "Spreadsheet / file export",
    label: "A spreadsheet or export",
    guidance:
      "We’ll review a sample of your file, map the vehicle fields, and check the photos and sold-vehicle information before discussing a live setup.",
  },
  {
    value: "Manual inventory management",
    label: "I manage it myself",
    guidance:
      "We’ll talk through the inventory you want to list and help work out a practical way to get your vehicles onto Bluebird.",
  },
  {
    value: "Not sure — help me choose",
    label: "I’m not sure",
    guidance:
      "You don’t need to know the technical details. Share your dealership website and we’ll help identify the right person and the available setup options.",
  },
];
export function DealerSetupExplorer({
  draft,
  onChange,
}: {
  draft: DealerSetupDraft;
  onChange: (draft: DealerSetupDraft) => void;
}) {
  const selected = sources.find((source) => source.value === draft.provider);
  return (
    <section className="dealer-setup-section dealer-container" aria-labelledby="dealer-setup-title">
      <div>
        <h2 id="dealer-setup-title">How do you manage your inventory?</h2>
        <p>Pick the closest match. We’ll show you where we’d start.</p>
      </div>
      <div className="dealer-setup-content">
        <fieldset>
          <legend>Your current setup</legend>
          <div className="dealer-setup-options">
            {sources.map((source) => (
              <label
                key={source.value}
                className={draft.provider === source.value ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="inventory-setup"
                  value={source.value}
                  checked={draft.provider === source.value}
                  onChange={() => onChange({ ...draft, provider: source.value })}
                />
                {source.label}
                {draft.provider === source.value && <Check size={16} />}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="dealer-count-options">
          <legend>Roughly how many vehicles?</legend>
          {["1–20", "21–50", "51–100", "100+"].map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={draft.inventoryCount === count}
              onClick={() => onChange({ ...draft, inventoryCount: count })}
            >
              {count}
            </button>
          ))}
        </fieldset>
        <div className="dealer-setup-answer" aria-live="polite">
          <h3>{selected ? "Your starting point" : "We’ll help you work out the connection."}</h3>
          <p>
            {selected?.guidance ??
              "Choose your current setup above, or go straight to the inquiry form. We’ll review the options with you before anything is connected."}
          </p>
          {selected && (
            <p className="dealer-setup-saved">
              Your choices will be included in the form above. You can edit them before sending.
            </p>
          )}
          <a href="#connect" className="dealer-button">
            Talk through my setup <ArrowRight size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

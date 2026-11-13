import { useState } from "react";

type Choices = { personalization: boolean; advertising: boolean };

export function ShoppingPrivacyDialog({
  initialChoices,
  onSave,
  onClearHistory,
}: {
  initialChoices: Choices;
  onSave: (choices: Choices) => Promise<void>;
  onClearHistory: () => Promise<void>;
}) {
  const [choices, setChoices] = useState(initialChoices);
  const [customize, setCustomize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Privacy choices"
      className="fixed bottom-20 left-3 right-3 z-50 max-w-sm rounded-2xl border border-border bg-background p-4 shadow-lg sm:bottom-4 sm:left-4"
    >
      <h2 className="text-sm font-semibold">Cookies & preferences</h2>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        We use cookies and similar tools for personalized recommendations and advertising. Choose
        what works for you.
      </p>
      {customize && (
        <fieldset disabled={busy} className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
          <legend className="sr-only">Optional privacy settings</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={choices.personalization}
              onChange={(e) => setChoices({ ...choices, personalization: e.target.checked })}
            />
            Personalized recommendations
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={choices.advertising}
              onChange={(e) => setChoices({ ...choices, advertising: e.target.checked })}
            />
            Advertising & measurement
          </label>
        </fieldset>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              onSave(customize ? choices : { personalization: true, advertising: true }),
            )
          }
          className="min-h-10 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {customize ? "Save choices" : "Accept all"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => onSave({ personalization: false, advertising: false }))}
          className="min-h-10 rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
        >
          Essential only
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <button
          type="button"
          disabled={busy}
          aria-expanded={customize}
          onClick={() => setCustomize(!customize)}
          className="underline underline-offset-2 disabled:opacity-50"
        >
          {customize ? "Back" : "Customize"}
        </button>
        {customize && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onClearHistory)}
            className="underline underline-offset-2 disabled:opacity-50"
          >
            Clear shopping history
          </button>
        )}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </a>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

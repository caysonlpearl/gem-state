import type { MarketingPreferences } from "@/lib/shopping-marketing";
export function ShoppingAlertPreferenceView({
  enabled,
  onChange,
  busy = false,
  error = "",
  emailPreferences,
  onEmailPreferences,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void | Promise<void>;
  busy?: boolean;
  error?: string;
  emailPreferences?: MarketingPreferences;
  onEmailPreferences?: (value: MarketingPreferences) => void | Promise<void>;
}) {
  return (
    <section className="rounded-2xl border p-5">
      <h3 className="font-semibold">Shopping emails and notifications</h3>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => void onChange(e.target.checked)}
        />
        <span>Send me personalized emails, notifications and recommendations.</span>
      </label>
      {emailPreferences && onEmailPreferences && (
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Choose your shopping emails
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            Up to one shopping email a day and three a week. We skip emails when there’s nothing
            useful to send.
          </p>
          <div className="mt-3 space-y-3">
            {(
              [
                ["prices", "Price drops"],
                ["searches", "Saved-search matches"],
                ["followups", "Saved-item and browsing follow-ups"],
                ["discovery", "New finds and weekly recommendations"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={emailPreferences[key] !== false}
                  disabled={busy}
                  onChange={(e) =>
                    void onEmailPreferences({ ...emailPreferences, [key]: e.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={emailPreferences.dailySearches === true}
                disabled={busy}
                onChange={(e) =>
                  void onEmailPreferences({ ...emailPreferences, dailySearches: e.target.checked })
                }
              />
              <span>Allow daily saved-search emails, up to seven a week</span>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Saved-search alerts you requested are separate from the broader shopping opt-in.
            Messages and essential account emails aren’t affected.
          </p>
        </details>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}

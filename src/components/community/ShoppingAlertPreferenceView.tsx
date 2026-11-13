export function ShoppingAlertPreferenceView({
  enabled,
  onChange,
  busy = false,
  error = "",
}: {
  enabled: boolean;
  onChange: (value: boolean) => void | Promise<void>;
  busy?: boolean;
  error?: string;
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
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}

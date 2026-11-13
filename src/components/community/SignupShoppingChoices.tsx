export function SignupShoppingChoices({
  accepted,
  alerts,
  onAccepted,
  onAlerts,
  termsUrl = "/terms",
}: {
  termsUrl?: string;
  accepted: boolean;
  alerts: boolean;
  onAccepted: (v: boolean) => void;
  onAlerts: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          required
          checked={accepted}
          onChange={(e) => onAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>
          I agree to the{" "}
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Terms of Service
          </a>
          .
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={alerts}
          onChange={(e) => onAlerts(e.target.checked)}
          className="mt-1"
        />
        <span>
          Send me personalized shopping emails and notifications about listings, recommendations,
          price drops, and offers.
        </span>
      </label>
    </div>
  );
}

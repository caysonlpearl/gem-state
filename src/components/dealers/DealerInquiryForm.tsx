import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import {
  dealerInquirySchema,
  type DealerInquiryAcknowledgement,
} from "@/lib/dealer-inquiry-contract";
import { submitDealerInquiry } from "@/lib/dealer-inquiry.functions";
import { trackDealerLead } from "@/lib/dealer-ads";
import type { DealerSetupDraft } from "./DealerSetupExplorer";
import { trackEvent } from "@/lib/analytics";

export function DealerInquiryForm({
  attribution,
  draft,
  onDraftChange,
}: {
  attribution: Record<string, string>;
  draft: DealerSetupDraft;
  onDraftChange: (draft: DealerSetupDraft) => void;
}) {
  const send = useServerFn(submitDealerInquiry);
  const hydrated = useHydrated();
  const requestKey = useRef<string | null>(null);
  const busy = useRef(false);
  const lastPayload = useRef("");
  const started = useRef(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (draft.provider || draft.inventoryCount) setExpanded(true);
  }, [draft.provider, draft.inventoryCount]);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [ack, setAck] = useState<DealerInquiryAcknowledgement | null>(null);
  useEffect(() => {
    if (ack?.created) trackDealerLead(ack);
  }, [ack]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || ack) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const payloadKey = JSON.stringify(fields);
    if (lastPayload.current !== payloadKey) {
      requestKey.current = crypto.randomUUID();
      lastPayload.current = payloadKey;
    }
    requestKey.current ??= crypto.randomUUID();
    const safeAttribution = Object.fromEntries(
      Object.entries(attribution).filter(([key]) => key.startsWith("utm_")),
    );
    const parsed = dealerInquirySchema.safeParse({
      ...fields,
      requestKey: requestKey.current,
      attribution: safeAttribution,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      form.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    setErrors({});
    setFailure("");
    try {
      const result = await send({ data: parsed.data });
      setAck(result);
      if (result.created) void trackEvent("dealer_inquiry_submitted", { route: "/for-dealers" });
    } catch (error) {
      setFailure(
        error instanceof Error && error.message.includes("Please wait")
          ? "Please wait before submitting another request. You can also email us below."
          : "We couldn’t save your request. Your details are still here—please try again, or email us below.",
      );
      void trackEvent("dealer_inquiry_error", { route: "/for-dealers", stage: "submission" });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const input = (
    name: string,
    label: string,
    options: {
      required?: boolean;
      type?: string;
      placeholder?: string;
      autoComplete?: string;
      maxLength?: number;
    } = {},
  ) => (
    <div className="dealer-field">
      <label htmlFor={`dealer-${name}`}>
        {label}
        {!options.required && <span> (optional)</span>}
      </label>
      <input
        id={`dealer-${name}`}
        name={name}
        type={options.type ?? "text"}
        required={options.required}
        placeholder={options.placeholder}
        autoComplete={options.autoComplete}
        maxLength={options.maxLength ?? 160}
        {...(name === "provider" || name === "inventoryCount"
          ? {
              value: draft[name],
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                onDraftChange({ ...draft, [name]: event.target.value }),
            }
          : {})}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `dealer-${name}-error` : undefined}
      />
      {errors[name] && (
        <p id={`dealer-${name}-error`} className="dealer-field-error">
          {errors[name]}
        </p>
      )}
    </div>
  );
  return (
    <section
      id="connect"
      className="dealer-form-panel"
      aria-labelledby="dealer-form-title"
      tabIndex={-1}
    >
      {ack ? (
        <div className="dealer-success" role="status">
          <CheckCircle2 size={50} />

          <h2 id="dealer-form-title">Request received.</h2>
          <p>We’ll review your inventory setup and contact you using the details you provided.</p>
          <p className="dealer-small">
            You’re all set for now. Your inventory will only go live after setup and review.
          </p>
        </div>
      ) : (
        <>
          <div className="dealer-form-heading">
            <img
              className="dealer-form-logo"
              src="/images/brand/bluebird-marketplace-logo.png"
              alt="Bluebird Marketplace"
              width="150"
              height="55"
            />
            <h2 id="dealer-form-title">
              Get your dealership
              <br />
              on Bluebird.
            </h2>
            <p>
              Tell us where to find your inventory. We’ll contact you to work through the setup.
            </p>
          </div>
          <form
            method="post"
            onSubmit={(event) => void submit(event)}
            onFocus={() => {
              if (!started.current) {
                started.current = true;
                void trackEvent("dealer_inquiry_started", { route: "/for-dealers" });
              }
            }}
            aria-busy={pending}
          >
            {input("dealershipName", "Dealership name", {
              required: true,
              autoComplete: "organization",
              placeholder: "Your dealership",
            })}
            {input("website", "Dealership website", {
              required: true,
              autoComplete: "url",
              placeholder: "yourdealership.com",
              maxLength: 300,
            })}
            <div className="dealer-form-pair">
              {input("name", "Your name", { required: true, autoComplete: "name", maxLength: 120 })}
              {input("email", "Work email", {
                required: true,
                type: "email",
                autoComplete: "email",
                maxLength: 255,
              })}
            </div>
            {input("phone", "Phone", { type: "tel", autoComplete: "tel", maxLength: 40 })}
            <div className="dealer-honeypot" aria-hidden="true">
              <label htmlFor="dealer-companyFax">Company fax</label>
              <input id="dealer-companyFax" name="companyFax" tabIndex={-1} autoComplete="off" />
            </div>
            <details
              className="dealer-optional"
              open={expanded}
              onToggle={(event) => setExpanded(event.currentTarget.open)}
            >
              <summary>
                Inventory details{" "}
                <span>
                  Optional <ChevronDown size={14} />
                </span>
              </summary>
              <div>
                {input("provider", "Current inventory provider", {
                  placeholder: "Provider name, or not sure",
                })}
                {input("inventoryCount", "Approximate vehicle count", { maxLength: 30 })}
                <div className="dealer-field">
                  <label htmlFor="dealer-notes">
                    Anything else? <span>(optional)</span>
                  </label>
                  <textarea id="dealer-notes" name="notes" rows={3} maxLength={2000} />
                </div>
              </div>
            </details>
            {failure && (
              <p className="dealer-submit-error" role="alert">
                {failure}
              </p>
            )}
            <button
              className="dealer-button dealer-submit"
              type="submit"
              disabled={!hydrated || pending}
            >
              {pending ? "Sending your request…" : "Connect my inventory"}
              <ArrowRight size={19} />
            </button>
            <p className="dealer-privacy">
              By submitting, you ask Bluebird to contact you about your inventory.{" "}
              <a href="/policies#privacy">Privacy & measurement</a>
            </p>
          </form>
        </>
      )}
      <noscript>
        <p>
          Please enable JavaScript to submit, or email{" "}
          <a href="mailto:bluebirdmarketplaceid@gmail.com">bluebirdmarketplaceid@gmail.com</a>.
        </p>
      </noscript>
    </section>
  );
}

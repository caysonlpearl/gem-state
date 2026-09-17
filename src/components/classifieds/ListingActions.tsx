import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, Info } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";

const DEFAULT_MESSAGE = "Hi, is this still available? I would love to learn more.";

/**
 * Direct-contact controls for the current classifieds MVP. Transactional
 * checkout and offers remain implemented elsewhere for a future phase, but
 * classified buyers currently arrange the sale directly with the seller.
 */
export function ListingActions({
  listing,
  showPaymentCalculator = true,
  showPriceHeader = true,
}: {
  listing: ClassifiedDetail;
  showPaymentCalculator?: boolean;
  showPriceHeader?: boolean;
}) {
  const { isSignedIn } = useAuth();
  const [contactOpen, setContactOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [loanTerm, setLoanTerm] = useState("60");
  const [downPayment, setDownPayment] = useState("0");

  const principalCents = Math.max(
    0,
    listing.priceCents - Math.round((Number(downPayment) || 0) * 100),
  );
  const payments = Number(loanTerm) || 60;
  const monthlyRate = 0.075 / 12;
  const principal = principalCents / 100;
  const monthlyPayment =
    principal === 0 ? 0 : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -payments));

  const inquiryMutation = useMutation({
    mutationFn: async () => {
      const { data: inquiryId, error } = await supabase.rpc("create_listing_inquiry", {
        _listing_id: listing.id,
        _message: message,
      });
      if (error || !inquiryId) {
        throw new Error(error?.message ?? "We could not send your message.");
      }
      return inquiryId;
    },
    onSuccess: () => {
      toast.success("Message sent to the seller.");
      setMessage(DEFAULT_MESSAGE);
      setContactOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "We could not send your message."),
  });

  return (
    <div className="floating-card overflow-hidden border-foreground/20">
      {showPriceHeader && (
        <div className="bg-primary px-5 py-4 text-primary-foreground">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/75">
            Seller price
          </p>
          <p className="numeric mt-1 text-[32px] font-bold leading-none">
            {formatUsd(listing.priceCents)}
          </p>
        </div>
      )}

      <div className="space-y-4 px-5 py-5">
        {showPaymentCalculator && (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Estimated payment
              </p>
              <p className="numeric mt-1 text-[22px] font-bold">
                {formatUsd(Math.round(monthlyPayment * 100))}
                <span className="ml-1 text-[12px] font-medium text-muted-foreground">/mo</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCalculatorOpen((open) => !open)}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
            >
              <Calculator size={14} /> {calculatorOpen ? "Hide calculator" : "Edit estimate"}
            </button>
          </div>
        )}

        {showPaymentCalculator && calculatorOpen && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-secondary/45 p-3.5">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-medium">
                Term
                <select
                  value={loanTerm}
                  onChange={(event) => setLoanTerm(event.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-2 text-[12px]"
                >
                  <option value="36">36 months</option>
                  <option value="48">48 months</option>
                  <option value="60">60 months</option>
                  <option value="72">72 months</option>
                </select>
              </label>
              <label className="text-[11px] font-medium">
                Down payment
                <input
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(event) => setDownPayment(event.target.value.replace(/[^0-9.]/g, ""))}
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-2 text-[12px]"
                  placeholder="$0"
                />
              </label>
            </div>
            <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              <Info size={13} className="mt-0.5 shrink-0 text-primary" /> Estimate uses 7.5% APR and
              does not include taxes, title, registration, fees, or lender approval.
            </p>
          </div>
        )}

        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Info size={15} className="mt-0.5 shrink-0 text-primary" />
          Contact the seller to confirm availability, condition, pickup, shipping, and the final
          amount.
        </p>

        <div>
          {isSignedIn ? (
            <button
              type="button"
              onClick={() => setContactOpen((open) => !open)}
              className="h-12 w-full rounded-full bg-nav-accent text-[14.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {contactOpen ? "Close message" : "Contact seller"}
            </button>
          ) : (
            <Link
              to={brand.urls.auth}
              className="flex h-12 w-full items-center justify-center rounded-full bg-nav-accent text-[14.5px] font-semibold text-primary-foreground"
            >
              Sign in to contact seller
            </Link>
          )}
        </div>
      </div>

      {contactOpen && isSignedIn ? (
        <form
          className="mt-4 space-y-3 border-t border-border px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            inquiryMutation.mutate();
          }}
        >
          <label htmlFor="seller-message" className="block text-[12px] font-medium">
            Message {listing.seller?.displayName ?? "the seller"}
          </label>
          <textarea
            id="seller-message"
            name="seller-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            minLength={10}
            maxLength={2000}
            rows={5}
            required
            className="w-full resize-y rounded-2xl border border-input bg-background px-3 py-2.5 text-[13px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ask about availability, condition, pickup, or shipping…"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Your email will be shared with the seller so they can reply directly.
          </p>
          <button
            type="submit"
            disabled={inquiryMutation.isPending}
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {inquiryMutation.isPending ? "Sending…" : "Send message"}
          </button>
        </form>
      ) : null}

      <p className="border-t border-border px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Gem State does not process payment for this listing. Confirm the item, price, and meeting or
        shipping details with the seller before exchanging money.
      </p>
    </div>
  );
}

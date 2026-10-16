import { useEffect } from "react";
import { DeviceMobile, Phone } from "@phosphor-icons/react";

import { useAuth } from "@/hooks/useAuth";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";
import { formatClassifiedPrice } from "@/lib/classifieds-display";
import { OPEN_CONTACT_EVENT } from "./ContactSignInSheet";
import { trackSellerContact } from "@/lib/analytics";

function externalApplyHref(contact: string) {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return `mailto:${contact}`;
  return /^https?:\/\//i.test(contact) ? contact : `https://${contact}`;
}

/**
 * Keeps price and the contact action on screen on phones. On a listing page
 * the contact card sits several screens down, below the photos and
 * description, so without this most buyers never reach it.
 */
export function MobileContactBar({ listing }: { listing: ClassifiedDetail }) {
  const { isSignedIn, user } = useAuth();
  const seller = listing.seller;
  const isOwnListing = Boolean(isSignedIn && seller?.userId && seller.userId === user?.id);
  const isJob = Boolean(listing.job);
  // Partner homes have no Bluebird seller to message; their contact is the
  // listing agent on the original listing.
  const externalApply =
    isJob && listing.job?.applicationMethod === "external"
      ? listing.job.applicationExternalContact
      : (listing.externalHome?.sourceUrl ??
        listing.externalVehicle?.sourceUrl ??
        listing.originalListing?.url ??
        null);
  const messagesEnabled = Boolean(seller) && seller?.allowInternalMessages !== false;
  const directoryPhone = listing.directory?.phone ?? null;
  const showPrimary = Boolean(externalApply) || messagesEnabled || Boolean(directoryPhone);
  const hidden =
    Boolean(listing.ended) ||
    listing.isMock === true ||
    isOwnListing ||
    (!showPrimary && !seller?.contactPhone && !seller?.contactTextPhone);

  // Reserve room at the bottom of the page so the bar never covers the footer.
  useEffect(() => {
    if (hidden) return;
    document.documentElement.classList.add("has-mobile-contact-bar");
    return () => document.documentElement.classList.remove("has-mobile-contact-bar");
  }, [hidden]);

  if (hidden) return null;

  const price =
    listing.priceCents > 0
      ? formatClassifiedPrice(listing.priceCents, {
          wholeDollars: Boolean(listing.vehicle || listing.home),
          monthly: listing.home?.mode === "rent",
        })
      : null;
  const iconButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground";
  const primaryButton =
    "flex h-11 shrink-0 items-center justify-center rounded-full bg-nav-accent px-5 text-[14.5px] font-semibold text-primary";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-[640px] items-center gap-2">
        <div className="min-w-0 flex-1">
          {price ? (
            <p className="numeric truncate text-[18px] font-bold leading-tight text-foreground">
              {price}
            </p>
          ) : null}
          <p className="truncate text-[12px] text-muted-foreground">{listing.title}</p>
        </div>
        {seller?.contactTextPhone ? (
          <a
            href={`sms:${seller.contactTextPhone}`}
            onClick={() => trackSellerContact("text", listing)}
            className={iconButton}
            aria-label="Text seller"
          >
            <DeviceMobile size={18} aria-hidden="true" />
          </a>
        ) : null}
        {seller?.contactPhone ? (
          <a
            href={`tel:${seller.contactPhone}`}
            onClick={() => trackSellerContact("call", listing)}
            className={iconButton}
            aria-label="Call seller"
          >
            <Phone size={18} aria-hidden="true" />
          </a>
        ) : null}
        {directoryPhone ? (
          <a
            href={`tel:${directoryPhone.replace(/[^\d+]/g, "")}`}
            onClick={() => trackSellerContact("call", listing)}
            className={primaryButton}
          >
            <Phone size={17} aria-hidden="true" className="mr-1.5" /> Call
          </a>
        ) : externalApply ? (
          <a
            href={externalApplyHref(externalApply)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => trackSellerContact("apply_external", listing)}
            className={primaryButton}
          >
            {isJob
              ? "Apply"
              : listing.home?.mode === "rent"
                ? "Request a tour"
                : listing.originalListing
                  ? `Buy on ${listing.originalListing.platform}`
                  : listing.externalVehicle
                  ? "View original listing"
                  : "Contact agent"}
          </a>
        ) : messagesEnabled ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_CONTACT_EVENT))}
            className={primaryButton}
          >
            {isJob ? "Apply now" : "Message"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

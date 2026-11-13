import { createFileRoute } from "@tanstack/react-router";
import { SHOPPING_POLICY_VERSION } from "@/lib/shopping-contract";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Notice · Bluebird Marketplace" }] }),
  component: Privacy,
});
function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-5 px-5 py-12 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-sm [&_p]:leading-7 [&_a]:underline">
      <h1>Privacy Notice</h1>
      <p>Effective {SHOPPING_POLICY_VERSION}</p>
      <h2>Information you provide</h2>
      <p>
        We receive account and contact information, listings and photos, messages, saved listings
        and searches, preferences, and information needed for transactions you choose to undertake.
        Payment and identity-verification providers handle applicable financial credentials and
        verification records. We do not use those credentials, government identifiers, identity
        selfies, or private message bodies as recommendation vectors or advertising payloads.
      </p>
      <h2>Website activity and browser information</h2>
      <p>
        Subject to your choices, we record searches and filters, listings shown and their positions,
        visits, active viewing duration, photo interactions, favorites, contacts, and verified
        transaction outcomes. Requests include IP and connection information. Supported browser
        context may include language, timezone, viewport, device/browser category, referral source,
        campaign information, and performance measurements. We may use a combination of disclosed
        browser characteristics as an uncertain recognition signal; it does not independently join
        accounts or restore tracking you disabled.
      </p>
      <h2>Cookies and local storage</h2>
      <p>
        Essential storage supports login, security, and privacy choices. We also maintain service
        and aggregate activity statistics; without optional personalization, these analytics events
        omit account and persistent browser identifiers. Optional first-party cookies and local
        storage associate shopping activity with a returning browser. Signed-in activity can be
        associated with your account across devices. Shared devices can represent different people;
        we do not treat a browser identifier as proof of identity. You can disable personalization
        or clear shopping history through Privacy choices.
      </p>
      <h2>Bluebird phone apps</h2>
      <p>
        The phone apps use resettable first-party installation and session identifiers for guest
        shopping choices. Optional shopping activity includes visible listing impressions and their
        positions, searches, detail visits, time actively viewing a listing, photo interactions,
        saves, dismissals, and seller-contact actions. The apps do not use device fingerprinting or
        merge guest shopping history into a different person's account. Signed-in shopping history
        and personalization choices are shared with your Bluebird account on other devices.
      </p>
      <p>
        App privacy controls let you turn optional personalization off and clear shopping history.
        Clearing guest history resets the installation identifier; clearing signed-in history
        applies across your Bluebird account and preserves your explicitly saved listings.
        Notification permission from your phone is separate from the optional
        shopping-email/notification choice. Declining phone notifications leaves the marketplace
        usable.
      </p>
      <p>
        Native advertising measurement is off in unconfigured app builds. If enabled later, it
        requires a separate applicable advertising choice and, for tracking on iPhone, permission
        through Apple's App Tracking Transparency prompt. Declining tracking does not prevent
        first-party recommendations you separately allow. App advertising choices do not authorize
        website advertising, or vice versa. Advertising payloads exclude private messages, precise
        location, identity/payment information, and prohibited inventory.
      </p>
      <h2>Location and uploaded content</h2>
      <p>
        We use your selected shopping location and may estimate a general location from connection
        information. With browser permission, location can help find nearby listings. Precise
        browser coordinates are used transiently for distance calculations. Uploaded listing photos
        may contain format, orientation, camera, or location metadata; private metadata is not
        published as a shopper profile or used to silently change your listing location.
      </p>
      <h2>Recommendations and communications</h2>
      <p>
        We infer category, price, location, and listing interests from permitted activity. Public
        listing text and images may be processed into numerical representations for similarity
        matching. Shopping communications require an opt-in and are selected automatically;
        frequency varies. Disclosed email pixels can record approximate opens, and links record
        clicks and resulting activity. Opens may be generated by email software rather than a
        person. Turn off shopping communications in your account or through the unsubscribe link.
      </p>
      <h2>Connected services and advertising</h2>
      <p>
        Connected sign-in providers supply information within the permissions you grant. Signing in
        does not give Bluebird access to your entire social or browser history. When advertising
        measurement is enabled and configured, Google and Meta may receive allowlisted website
        events and identifiers through their browser tools or server integrations. We exclude
        private messages, financial and identity records, precise coordinates, and personal search
        text from those payloads. Advertising choices are separate from shopping-email permission.
      </p>
      <h2>Processing and retention</h2>
      <p>
        Our service infrastructure includes Supabase, Cloudflare, Resend, and applicable payment
        providers. Configured advertising integrations use Google and Meta under their policies.
        Background embedding jobs process public listing content. We do not purchase consumer
        profiles from data brokers. Browsing/search activity is retained for 90 days, with the
        latest 30 days normally informing recommendations; explicit favorites remain until removed.
        Transactions, security, and consent records have separate operational and legal retention
        needs.
      </p>
      <h2>Controls and contact</h2>
      <p>
        Use Privacy choices to manage optional personalization and advertising or clear shopping
        history. Use your account to change shopping communications. Browser/device permissions can
        be revoked in their settings. Applicable rights may include access, correction, deletion,
        and opting out of certain processing. Contact Bluebird support through the website for
        assistance.
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("shopping-privacy-open"))}
        className="rounded-full border px-4 py-2"
      >
        Open privacy choices
      </button>
    </article>
  );
}

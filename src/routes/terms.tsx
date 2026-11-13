import { createFileRoute } from "@tanstack/react-router";
import { SHOPPING_POLICY_VERSION } from "@/lib/shopping-contract";
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service · Bluebird Marketplace" }] }),
  component: Terms,
});
function Terms() {
  return (
    <article className="prose mx-auto max-w-3xl px-5 py-12">
      <h1>Terms of Service</h1>
      <p>Effective {SHOPPING_POLICY_VERSION}</p>
      <p>
        By creating an account or using Bluebird Marketplace, you agree to these terms. You must be
        at least 18 and able to enter a binding agreement. Provide accurate account information and
        protect your login.
      </p>
      <h2>The marketplace</h2>
      <p>
        Bluebird helps people discover listings and contact sellers. Sellers are responsible for
        their listings, ownership, availability, prices, descriptions, and transactions. Imported
        listings may change between source updates. Confirm material details with the seller.
        Bluebird does not guarantee that a listing is available or that a contact results in a sale.
      </p>
      <h2>Your content and conduct</h2>
      <p>
        Only submit content you have the right to share. You retain ownership and grant Bluebird
        permission to store, display, format, and distribute your submitted listing content to
        operate and promote the marketplace. Do not submit unlawful listings, impersonate others,
        harass people, attempt fraud, or interfere with the service. We may restrict accounts and
        remove content that violates these terms or applicable rules.
      </p>
      <h2>Personalized shopping</h2>
      <p>
        Subject to your privacy choices, Bluebird uses searches, viewed and saved listings,
        interactions, and transaction outcomes to personalize recommendations. Public listing text
        and photos may be processed into numerical representations to find similar listings.
        Rankings are estimates of relevance; they are not endorsements, guarantees, credit
        decisions, or proof of a purchase.
      </p>
      <h2>Shopping communications</h2>
      <p>
        Shopping emails and website notifications are optional. If you opt in, Bluebird selects
        relevant listing updates, price drops, recommendations, and genuine offers based on your
        activity. Frequency varies and multiple relevant updates may arrive in a day. You may turn
        shopping updates off in your account or use an email unsubscribe link. Account, security,
        transaction, and requested conversation messages are handled separately.
      </p>
      <h2>Payments and third-party services</h2>
      <p>
        Applicable payment, verification, delivery, and external seller services have their own
        terms. Any fees and payment obligations must be disclosed in the applicable transaction.
        These terms do not authorize Bluebird to make purchases or change seller prices on your
        behalf.
      </p>
      <h2>Your information and choices</h2>
      <p>
        Our <a href="/privacy">Privacy Notice</a> explains collection, use, processors, retention,
        and controls. Accepting these terms does not replace browser permissions or any separately
        required consent. Contact support through the website to request access, correction, or
        deletion.
      </p>
      <h2>Changes and availability</h2>
      <p>
        We may update the service and these terms. Material changes will be identified with a new
        version and communicated through the service. The marketplace is provided as available,
        subject to rights and remedies that applicable law does not allow us to exclude.
      </p>
    </article>
  );
}

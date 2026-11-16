# Situational shopping emails

The ten registered `marketing-*` templates use the actual Bluebird logo, navy
headlines, blue actions, listing photography, current prices, locations, and a
short preference/unsubscribe footer. The approved mailing address lives in brand
configuration. No auction, competing-buyer, discount, sale, or scarcity claim is
inferred from browsing or inventory refreshes.

## Situations

1. **Welcome picks**: one group of at least three Idaho listings after a new
   marketing opt-in following program installation. Browsing permission is not
   required; these are general picks. Existing members are not backfilled into
   a welcome campaign. Unconfirmed email is deferred, not consumed.
2. **Saved-search matches**: newly observed listings satisfying an explicit,
   unpaused saved search. Overlapping searches share a listing/event key.
3. **Price drops**: an actual previous-to-current reduction on an eligible
   followed listing. Show both prices and dollar reduction when known. A zero
   or unknown price displays “Contact for price”, never a free item or saving.
4. **Saved-item follow-up**: one follow-up after 72 hours on a real current save.
5. **Browsing follow-up**: one follow-up after 72 hours on qualifying repeated
   browsing in different sessions, without falsely saying it was saved.
6. **New similar listings**: sufficiently ranked new arrivals around known
   interests, excluding the original items and durable negative choices.
7. **Local finds**: Thursday discovery window, with at least three new relevant
   listings in a city/state already supported by the shopper’s activity.
8. **Category finds**: Tuesday window, with at least three new ranked listings
   in a category the shopper has explored.
9. **Weekly picks**: Saturday window, at least three sufficiently relevant new
   listings. Previously sent listings are excluded for seven days.
10. **New since your last visit**: at least three relevant arrivals after the
    last meaningful visit, for shoppers inactive 14–30 days. Renewed activity
    suppresses the queued comeback before provider handoff.

Discovery windows use the Idaho market timezone. Per-recipient email
availability uses a known browser timezone when present, otherwise Boise, from
8 a.m. to 8 p.m. New groups require fresh inventory after program launch;
refreshing unchanged feed records does not reset `first_seen_at`. Welcome and
discovery messages do not imply that every displayed listing is newly posted.

## Delivery and preferences

Apply `20261116180000_marketing_email_program.sql` before deploying the code.
It adds private preference storage and the program start timestamp, and replaces
the existing recipient-serialized claim function. It does not grant marketing
consent. The function allows at most one shopping email in a rolling 24 hours
and three in seven days; members may explicitly allow up to seven requested
saved-search emails. That exception never raises the discovery cap.

The strongest campaign wins: price drops, requested matches, new similar items,
local/category finds, follow-ups, weekly/welcome/comeback. Each claim contains
at most six items of one campaign. Existing durable delivery IDs, provider
idempotency keys, leases, and capped retries stay authoritative. Deferred items
remain pending; expired candidates are retired. A provider-accepted email is
counted even if final acknowledgement requires a retry.

Account settings expose price-drop, search-match, follow-up and discovery email
choices plus the explicit daily-search option. The master shopping consent and
individual saved-search permissions retain their existing meaning. Preference
and availability checks run again after rendering, immediately before handoff.
Website shopping notifications are published independently of the email cap;
messages, authentication and transaction emails are outside this program.

Photo URLs in sent messages resolve through an unguessable delivery token and
its specific queue item. The server rechecks the public listing and resolves
its current image, rather than embedding an expiring R2 signature. Removed or
ineligible listings cannot expose private media. The route accepts no arbitrary
object key or redirect. Tracking of a roundup button does not manufacture a
listing-view or a verified purchase.

## Proof and rollout

`scripts/marketing-email-preview.tsx` renders all ten templates from supplied
public listing cards without sending email. The gallery labels its preview
data and has desktop/phone widths. No live price history or member activity is
invented for previews. Unit tests cover ten HTML/plain-text renders, eligibility,
frequency limits, preferences, priority, retries and photo ownership checks.

Before migration, inspect the production project and save the existing claim
definition/control state. Preserve the existing delivery switch. After deploy,
verify the new preference fields and image route, then observe actual scheduled
deliveries. Rendered previews, a successful build, and installed database rules
are separate from provider acceptance or inbox delivery. No blanket campaign is
sent as part of installation.

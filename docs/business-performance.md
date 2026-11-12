# Business performance

Administrators can open `/admin/business-performance` from Admin → Analytics, a dealer's admin row, or the admin-only link on a dealership profile/vehicle contact card. Windows cover the past 7, 30, or 90 days. Select a business for its vehicle breakdown, daily views, CSV export, and copyable performance summary.

## Measurements

- **Listing-card clicks:** an activation of the photo/title link that opens a Bluebird listing. These are separate from **detail views**, which can also arrive directly from search engines or shared links.
- **Profile clicks/views:** the vehicle-to-dealer link and visits to the public dealer page, recorded separately.
- **Website clicks:** a link to the identified business's website. **Original listing clicks** identify the specific vehicle/source destination separately.
- **Call/text/email/directions:** button/link activations, not verified completed communications.
- **Inquiry conversations:** recorded only after the message service acknowledges an accepted conversation. Opening a form is not an inquiry.
- **Save actions:** recorded save actions, not a current saved-inventory total.
- **Measured browsers:** distinct available browser session identifiers across business activity. They are not verified individuals or cross-device identities.
- **Interested browsers:** distinct browsers with website/original-listing referrals, call/text/email activations, or accepted inquiries. Views and listing-card clicks alone do not imply purchase interest.

Staff/moderator visits, identified dealer owners/staff viewing their own business, marked QA/internal traffic, demos, preview hosts, and recognized bots are excluded. Delivered events with the same event ID count once. These filters cannot identify all automation or anonymous owners on unrelated devices.

## Attribution and history

API dealers use provider dealer IDs; authorized/native dealers use their public profile slug. An API dealer merges into an official profile only when its official website host and branch location match unambiguously. Missing postal codes require an exact normalized business-name match. Other branches are kept separate.

A registered business may use an ordinary seller storefront instead of a dealer account. Its public storefront slug is stored in the private business directory, and its native listings are attributed across all categories, including industrial equipment, trailers, and parts. New listings from that storefront join the report automatically. This does not create a dealer account or classify unrelated private sellers as businesses. Existing listing-view/contact events can be attributed by listing ID; new card/profile events carry only the listing ID or public storefront slug until the server resolves the registered business.

Public business metadata and listing titles are retained in service-only attribution tables when reports are loaded. New listing events also carry the public business identity; vehicle events carry their public title/source. Historical counts do not require a vehicle to remain available. Removed inventory is never labeled sold.

The report uses saved provider inventory and published authorized feeds. It never calls a provider to refresh inventory, spends API allowance, or creates marketplace listings. Unchanged attribution is not rewritten on every report read.

Older listing views/contact events are included when a trustworthy current or saved attribution exists. Missing historical attribution is disclosed rather than guessed. Newly added click types have no backfilled counts before deployment.

## Sales model

No default conversion rate or sales count is supplied. An administrator may save a 0–100% conversion assumption for a dealer or clear it. Modeled sales equal distinct interested browsers × assumed percent / 100. Reports, exports, and copied summaries label the result unverified. It is not evidence of a sale, and disappearance from a feed is not a sale signal.

Confirm actual leads and sales with a dealership/CRM before claiming attributed revenue or purchases in a sales pitch.

## Access and storage

Both report reads and assumption writes require authenticated administrator authorization before creating a service client. Responses are private/no-store. New attribution, model, and release tables deny anonymous/member access with RLS and revoked grants. Only server-side service-role access writes or reads them. Public events include business metadata and opaque listing IDs, never message contents, account identifiers, or private contacts.

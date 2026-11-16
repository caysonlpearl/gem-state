# Recommendation data use and quality — November 16, 2026

This is an implementation/research checkpoint, not a completed store launch or
permission to collect every field mentioned in a competitor policy. The owner's
priority is accurate terms and useful recommendations across Bluebird's app and
website. Paid enrollment and the unfinished deletion stack remain separate.

## Verified baseline

A read-only production query observed 3,374 currently valid inventory records and
3,300 embedding rows whose content hash matched current inventory. The count did
not independently validate each embedding's model version or recommendation
quality. Tracking, recommendations, embedding work and learning were enabled;
model version was rules-v1 and the model object had no configured weights. The
source default engagement weight is zero. Foreground time/photo features are
collected and can be evaluated, but should not be advertised as a currently
weighted driver of every recommendation.

The owner explicitly enabled personalization for their own account; 26 visible
impressions were subsequently observed. No other member was opted in. Build 19
was independently read back from the iPhone, and the owner confirmed actual
member photos and consistent card heights. Home return, successful pull refresh
and the existing native foreground revision trigger fresh recommendations.

## Public competitor evidence

- [eBay engineering](https://innovation.ebayinc.com/stories/evolving-recommendations-a-personalized-user-based-ranking-model/)
  describes candidate retrieval followed by ranking using browsing/search/watch
  relationships and user/item representations. Apply the two stages to cached
  inventory and public listing features; this does not reveal its full current
  private implementation.
- [Mercari's March 2026 Japanese product account](https://careers.mercari.com/en/mercan/articles/58602/)
  describes preference learning for color/size/price, image search, recent
  behavior and discovery diversity. It is not proof of identical US behavior.
  [Mercari US privacy](https://www.mercari.com/us/help_center/topics/account/policies/mercari-privacy-policy/)
  separately discloses service usage, device/location information and some
  third-party combinations; it does not establish that every disclosed category
  feeds recommendations.
- [Marketplace engineering, 2018](https://engineering.fb.com/2018/10/02/ml-applications/under-the-hood-facebook-marketplace-powered-by-artificial-intelligence/)
  describes combined listing text/images, buyer search interests, efficient
  retrieval and richer ranking. Treat it as historical architecture, not the
  exact current model or a feature Bluebird can access through Facebook login.
- [TikTok help](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content)
  describes interaction, content and user-context signals; interaction importance
  differs across feeds/search. Evaluate Bluebird foreground viewing and photo
  exploration against useful contacts, rather than copying a watch-time goal.

## First implementation batch

Terms, Privacy and existing controls now explain actual first-party signals,
app/website continuity, opt-in and withdrawal, and why recording an event differs
from weighting it. They distinguish selected uploads/nearby search from ambient
camera/microphone/motion or unrelated-app history. No collection purpose,
permission, consent scope, signup checkbox, SDK, retention period or email cadence
changes. These are clarifications of the existing policy version, not a new
contract acceptance or a silent opt-in. The actual publication must be verified
separately from this source checkpoint.

The recommendation service adds up to four distinct recent search candidate
scopes to the existing maximum eight category/home-interest scopes. A search-only
shopper can retrieve relevant older cached listings before opening a detail page.
Title filters use up to four deduplicated, sanitized alphanumeric words; private
query text/operators do not leave the helper. Category and home mode remain
separate. Exact duplicate scopes share one query. Queries use at most four-way
concurrency, 80 rows per scope and one six-second deadline. Current eligibility,
native restrictions, account/privacy rechecks, seller variety and explicit
search/sort semantics are preserved. There are no new listing-provider requests,
model inference calls, migrations or paid services. Exposure model names add
search-intents-v1; reviewed weight promotion is unchanged.

## Next quality work

1. Prove opt-in activation, detail/search/save/contact events and foreground
   refresh with a controlled account on real devices. Impressions alone are not
   strong preferences. Do not fabricate activity on a member's account.
2. Evaluate distinct short-term/session interests and structured brand/model,
   size/color, condition, budget and location fit. Keep the agreed baseline until
   evidence supports a reviewed ranking change; small datasets do not justify
   claiming automatic self-improvement.
3. Evaluate bounded exploration, repeated-exposure handling and aggregate item
   relationships from consented Bluebird activity. Preserve seller diversity and
   separate category/home intents. Do not reintroduce the removed Not interested
   buttons without a new owner instruction.
4. Measure contacts per shopper with stable comparison, return visits and
   exposure/position/model evidence. Keep genuine outcomes separate from contact
   clicks, elapsed viewing and missing inventory.
5. Consider user-selected image search or user-initiated voice search as later
   features with purpose-specific permissions and retention. Neither is active.

## Public listing facts batch

The model input now uses one deterministic projection of public facts for both
the private embedding worker and the catalog's content hash. In addition to title
and photos, it includes category-specific item fields (for example brand, size
and material), condition, named vehicle specifications, home mode/type/bedrooms/
bathrooms/area, selected pet suitability attributes, and bounded service/job
facets. Arbitrary nested card/provider metadata, VINs, agent/application contacts,
private messages, addresses and precise coordinates are not serialized. Existing
free-text sanitization also rejects apparent credentials, URLs and contact data.

Changing facts actually supplied to the model or the cover revision invalidates
the cached vector. Price and expiring photo signatures do not; budget remains a
separate ranking feature. This input-schema change will regenerate existing
vectors within the existing hourly job's bounded capacity. Missing/currently
regenerating vectors retain the nonvisual recommendation fallback. No additional
provider requests, personal activity collection or paid inference service is
introduced. Source tests are not proof of live vector refresh or relevance gains.

## Additional features requested November 16

The owner requested all three: nearby recommendations, chosen-photo/camera search
and tap-to-speak search. These are implementation requests, not consent on behalf
of members. Foreground nearby search already has an explicit location action and
rounds its center before use. Automatic/background location is not authorized.
Photo and speech search still require implementation and device checks; do not
publish disclosures claiming they are active before they work. Each needs a clear
purpose, contextual permission, denial/cancellation handling and a deletion/
retention boundary. Speech processing must disclose whether it leaves the device.
Private query photos must never be put in the public listing catalog or public
embedding workflow. Image inference capacity and any new cost must be measured
and priced before commitment. Signup remains exactly two choices.

## Device and external-data boundary

[Apple data-use rules](https://developer.apple.com/app-store/user-privacy-and-data-use/)
require ATT for covered cross-company tracking and prohibit fingerprinting; ATT
is not access to unrelated apps. [Google Play User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
requires disclosed, expected purposes and applicable runtime permissions for
sensitive access. Terms do not replace those controls.

Bluebird's current high-value data is its own shopping activity, chosen area and
public listing content. Meta/Google measurement is not a return API for an
unrestricted consumer profile; basic login does not import private browsing.
Camera/gallery access supports chosen uploads. No ambient listening, passive
camera recording, motion profiling, background location, purchased consumer
profiles or cross-app fingerprinting is added. Private messages, identity/payment
credentials and precise coordinates remain excluded from ranking/ad payloads.

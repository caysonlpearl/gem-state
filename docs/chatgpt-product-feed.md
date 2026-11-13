# ChatGPT discovery feed

Hosted address: `https://onbluebird.com/feeds/chatgpt.csv`.

This endpoint generates a complete CSV from current, approved Bluebird catalog listings, using an anonymous, row-security-limited database client. It has no scheduled job, database writes, provider refresh, paid API calls, or OpenAI credentials. HTTP caching is five minutes; OpenAI's retrieval and ingestion cadence adds a separate delay. It is a discovery feed, with Ads and checkout explicitly disabled. Active classified stock is `unknown`, since Bluebird does not independently confirm seller availability.

## Category review — November 13, 2026

The OpenAI Commerce policies govern organic shopping feeds. Advertising rules are separate; this feed does not enable advertising.

- Candidate physical-goods categories: Furniture, Apparel & Accessories, Baby & Kids, Books & Media, Collectibles, Crafts & Hobbies, Electronics, Home & Garden, Jewelry & Watches, Musical Instruments, Office & Business, Tools & Equipment, Industrial, Outdoor & Sporting, Farm & Garden, and General. Individual products must still qualify.
- Vehicles, Motorcycles, RVs & Campers, Powersports, Auto Parts, and Trailers are not explicitly prohibited by the published general Commerce policy reviewed. The export supports owner/admin-approved native listings with a real make/brand, explicit condition, fixed price, photo, and seller. This is a policy interpretation, not affirmative approval of vehicle listings by OpenAI.
- Excluded: Firearms (including ammunition and firearm accessories) and Pets/live animals, which the Commerce policy explicitly prohibits.
- Held for format/eligibility confirmation: Homes, Jobs, Services, and Tickets & Events. The standard discovery feed describes a priced purchasable item, and these need separate confirmation. The Ads policy explicitly prohibits individual housing and job listings; that advertising restriction should not be presented as a proven organic-feed rule.
- Health & Beauty is held as a mixed-risk category: prescription products and supplements are prohibited. A future reviewed subset of ordinary cosmetics/equipment could qualify.

Allowlisting a category is not a guarantee that every item fits. The item screen holds restricted/uncertain goods (weapons, drugs, supplements, nicotine/alcohol, counterfeit/pirated/stolen goods, hazards, recalled/unsafe goods, live animals, broken/parts-only inventory). This conservative keyword screen can over-hold items and does not replace marketplace moderation or OpenAI review.

## Source and field requirements

Only `asks` already approved for publication on Bluebird are read, including seller imports that have been published into that catalog through Bluebird's authorized import process. External provider caches (MarketCheck, home/job aggregators, RescueGroups, business directories, Guns.com) and direct dealer-feed inventory are not exported. Website visibility alone does not establish a provider's onward redistribution permission. Adding those sources requires confirming feed rights and preserving the actual seller's identity and terms.

Rows must be non-demo, active, unexpired, approved, have a published non-demo product, a supported marketplace location (Idaho, Utah, Oregon, or Washington), a positive integer USD price, a photo, a known condition, and a public seller storefront. The state scope reuses the shared marketplace configuration. No private seller-profile fields, contact details, government IDs, messages, credentials, or storage paths are selected.

OpenAI currently requires a real brand. The exporter uses a supplied brand/maker, catalog brand, vehicle make, or a small list of clear brand prefixes present in the published title/brand-model text. It does not invent a brand or substitute Bluebird/Generic. Missing metadata means a held row; many existing imported listings have no brand. Correcting listing metadata is the right way to expand coverage.

Product URLs use Bluebird's canonical listing-path builder. Image URLs use the existing stable public listing-photo route, not an expiring storage signature. The route checks publication rules and issues a current signed redirect. CSV quotes all values and doubles embedded quotes; multiline descriptions and JSON country arrays are preserved.

Any page or seller lookup failure, timeout, or safety-limit overflow returns 503 with `no-store` and `Retry-After`, rather than a partial replacement catalog. Public responses disclose only version and exported-row count headers. Empty successful inventory yields a header-only CSV; it is distinguishable from a backend failure.

## Connection and operational limits

In Business Hub, open Bluebird → Products → Add products, select hosted URL when offered, and enter the hosted address above. Select the processed catalog in Agent builder → Product feed. Validate the import, photos, product links and response quality before considering discovery verified. Publishing this endpoint does not by itself connect it, establish acceptance, or guarantee recommendation/display.

The endpoint omits sold, expired, hidden and removed listings on the next uncached fetch. OpenAI feed omission can retain a prior product record for up to 14 days; it is not an immediate platform removal. Every exported row uses `availability=unknown`, and the live listing remains authoritative. A future durable export ledger plus supported removal updates would be needed to guarantee prompt downstream withdrawal of previously ingested records. Do not advertise this snapshot as real-time stock.

Sources reviewed:

- https://openai.com/policies/commerce-policies/
- https://openai.com/policies/ad-policies/
- https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt
- https://learn.chatgpt.com/commerce/specs/file-upload/products
- https://learn.chatgpt.com/commerce/guides/submit-product-feeds
- https://learn.chatgpt.com/commerce/specs/file-upload/overview

Validation: `node --experimental-strip-types --test tests/chatgpt-product-feed.test.mjs`, TypeScript, production build, and an anonymous live CSV/photo/link fetch after deployment.

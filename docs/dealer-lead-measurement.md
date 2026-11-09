# Dealership inquiry measurement

Use `https://onbluebird.com/contact?interest=dealership` as the dealer-acquisition ad destination. The advertising page also links into this form and preserves the OpenAI `oppref` reference across its contact links. The regular contact form can select dealership inventory and partnership explicitly. General support and other advertising messages do not emit dealership conversions.

The existing contact intake stores the message before returning an acknowledgement with its normalized interest and a random event ID. Dealership details are retained in that private message, and subjects are labeled `[Dealership]`. No new database permissions or schema are introduced.

After the success screen removes the form, the browser queues the existing Bluebird pixel (`QwZ496FXpY5Z2pc8bAJS2Y`) and the standard `lead_created` / `customer_action` event with the acknowledgement ID. Repeated success effects are deduplicated. No form fields are passed to ad measurement. Pixel errors cannot change an accepted submission. Browser privacy signals, preview hosts, automated browsers and `_qa=1` visits suppress ad measurement. Existing SDK consent denials are not overridden.

Reference: https://developers.openai.com/ads/measurement-pixel

Validation includes accepted/failed persistence, general-contact compatibility, dealer-required fields, exact queued calls, duplicate acknowledgements, SDK failure and privacy/test suppression. Live QA uses `_qa=1` so a synthetic contact submission does not count as an advertising lead. Ads Manager receipt and attribution remain observable after the first genuine qualifying inquiry. This change does not create or start a campaign.

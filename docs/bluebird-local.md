# Bluebird Local

Public hub: `/news`. Editor: `/admin/news`. Existing guides keep `/guides/...` addresses.

## Writing and publishing

1. Request a researched original article through the Bluebird chat.
2. Review the draft and its sources. In the editor, choose **New article** and paste the draft, introduction, and headline.
3. Choose relevant classified categories and an optional city. Bluebird builds browse/post prompts and shows up to four cached related listings.
4. Use **Preview article**, then choose **Published** and **Save & publish** after review. Future dates become scheduled publications; the scheduler releases them within 15 minutes of the selected time.
5. Choose **Draft** or **Archived** to unpublish. Original URLs remain stable after the first save.

Paragraphs, section headings, lists, tables, and source links are supported. Cover photographs require a credit and a recorded right to use them. Article bodies are sanitized on the server. No writing service runs or incurs charges in the background.

## News sources

Idaho Capital Sun, Utah News Dispatch, and Idaho@Work start in headline/link mode. Their article text and photographs are not copied into public pages. Idaho Fish and Game starts paused because its website was under maintenance during setup; verify its RSS address before enabling it.

Record publisher permission covering Bluebird's commercial use before choosing full-story imports. Photograph permission is separate, and imported photos must carry the publisher's credit. A publicly accessible feed is not itself a license.

Idaho stories take priority in the default feed. At most four Utah source stories per publication day are selected automatically; more remain reviewable in the editor. Uncertain geography and incomplete full-text stories also wait for review. The editor explains each reason.

Sources are checked every six hours. Database reservations prevent concurrent fetches, unchanged feeds use conditional requests, and failed/incomplete feeds never remove existing stories. Feed-wide changes are batched. Changes to manually edited or archived stories go into a publisher-update queue: preview before applying or keep the Bluebird version.

## Performance and search

Readers never fetch publisher feeds or refresh paid listing providers. Related cards read the existing homepage snapshot after the article has rendered; failures leave the article and its browse links available. Published articles are read through a permission-aware database view. Article responses avoid stale HTTP caches so unpublishing and source-permission revocation take effect on the next request.

Originals have article metadata and regular sitemap entries. The separate `/news-sitemap.xml` includes eligible original news from the preceding two days. Republished copies default to `noindex,follow`; external headlines do not create local stub pages. Guides and market-report eligibility rules remain intact.

The editor's 30-day counters show reads, classifieds clicks, attributed listing views, completed inquiries, and listing submissions. Click attribution follows the same browsing session for up to two hours; preview, internal, and bot traffic are excluded where marked. Search Console supplies search impressions and indexing evidence.

## Deployment

Apply `20261030230000_bluebird_local_editorial.sql`, deploy the routes, then apply `20261030233000_bluebird_local_schedule.sql`. The schedule reuses the existing authenticated internal-job command without placing credentials in the repository. It changes no existing job. Both this job and the worker's existing scheduled entry can run safely because the source lease enforces the six-hour refresh interval.

The PostgreSQL contract check in `tests/sql/editorial-contract.sql` verifies private drafts, unpublishing, original publication dates, permission gating, and refresh locking entirely inside a rolled-back transaction. Parser, sanitization, deduplication, geographic, cache, and CTA tests live in `tests/editorial.test.mjs`.

# Homepage saved inventory

The homepage reads `homepage-snapshots/v1/home.json` from public Supabase Storage, rather than running browse queries or calling providers during a page read. The object contains only public card fields. The existing cards, row layout, detail routes and provider refresh budgets are unchanged.

The initial homepage response projects this full saved pool to the cards selected
by every existing row and the first 24 remaining feed cards. Server projection
and browser rendering share the same allocation function. This keeps the visible
row order and cards intact without serializing hundreds of unused candidates.
Category landing previews and prepared SEO pages still use their complete saved
pools. Counts retain their original meaning rather than becoming the projected
array length.

Load more retrieves subsequent 24-card pages from the saved pool, excluding IDs
already displayed. A failed read leaves the current cards and continuation intact
for retry. Only after that saved remainder is exhausted does the previous browse
pagination path continue. Initial reads and these saved continuation pages make
no upstream provider requests.

A background refresh can run once per five minutes across all server instances. The scheduled refresh paths use the same lease. The writer reads the prior object directly from authenticated storage after acquiring the lease. A failed or invalid read aborts the write. The public CDN copy is used for page rendering and the fast freshness check.

Each source reads already-saved inventory. The refresh checks moderation first, gives the core inventory reads priority, and runs at most two source loaders at once. Homepage rendering, provider maintenance and SEO warming have separate connection windows in each invocation. A source failure retains that source's prior data for up to six hours without changing its timestamp. A failed moderation check or storage write retains the previous snapshot. Successful empty inventory stays empty. Expired sections are omitted.

## Deployment

Use the GemList production project (`udxxfuticbxwiehoepeg`). Create the public `homepage-snapshots` bucket, allowing JSON objects up to 2 MB. Keep uploads restricted to the service role; public access is read-only. No provider keys belong in this bucket.

Seed before deploying a first installation:

```sh
node --env-file=/path/to/server.env scripts/refresh-homepage.mjs
```

The command prints source counts and timestamps, never credentials or card contents. Verify that native and vehicle sections are populated before publishing. The seed uses database credentials, not provider API credentials, and spends no provider calls.

The protected `POST /api/internal/homepage-refresh` endpoint uses the existing cron authentication. Normal homepage requests schedule refreshes outside the response lifetime when the runtime supports `waitUntil`.

A failed refresh holds its five-minute lease until the next slot. For a confirmed abandoned refresh only, an operator can run the seed with `--retry` to remove that slot's lease. Do not use this while another refresh is running. Old files under `leases/` are disposable coordination records and can be removed after their slot ends.

If the snapshot cannot be read and an instance has a usable in-memory copy, it serves that copy. With no usable snapshot, the existing error/retry UI remains honest; it does not fabricate listings or fall back to paid provider calls.

After an outage, check the public object's `generatedAt`, each section's `updatedAt` and card count, and `sourceFailures`. A recent `generatedAt` alone can reflect a partial refresh. Verify the restored vehicle and Fresh local finds rows from the public homepage and check the next scheduled refresh for recurring failures.

## Homepage location and logos

The first browser visit requests geolocation permission after hydration, without delaying inventory. A grant centers the existing radius filters; a denial, dismissal or unsupported browser leaves the statewide feed available. Only the fact that a prompt was requested is stored locally; coordinates stay in page memory. Visitors can retry with Use my location or choose a city manually. Late geolocation results do not replace manual selections.

The distance row shows Around Idaho before a local origin is chosen, then Farther away outside the chosen area. It uses the same saved Idaho inventory and a wider Idaho browse link.

Job logos reuse fresh employer_logo_matches in cache-only mode. Service logos use the directory website domain. Snapshot refreshes do not search Logo.dev for unknown employers, and missing or unmatched logos retain the existing initials fallback.

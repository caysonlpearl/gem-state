# Homepage saved inventory

The homepage reads `homepage-snapshots/v1/home.json` from public Supabase Storage, rather than running browse queries or calling providers during a page read. The object contains only public card fields. The existing cards, row layout, detail routes and provider refresh budgets are unchanged.

A background refresh can run once per five minutes across all server instances. The existing half-hour scheduled endpoint also refreshes it. Each source reads already-saved inventory; a source failure retains that source's prior data for up to six hours. A failed moderation check or storage write retains the complete previous snapshot. Successful empty inventory stays empty. Expired sections are omitted.

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

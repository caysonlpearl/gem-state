# Inventory worker on the existing DigitalOcean server

Motive returns a browser-check HTML page to the website's hosting network.
The existing Bluebird DigitalOcean server can receive the authorized XML feed.
It runs the same compiled production inventory endpoint in-process, with no new
HTTP listener, firewall opening, public feed mirror or additional subscription.

Build with `npm ci && npm run build`, verify `npm run test:inventory` and
`npm run test:seo:ssr`, then place `.output/server` under a release's `.output/`
and these runner/loader files in that release. Deploy releases atomically under
`/opt/bluebird-inventory/releases/` and point `current` at the tested release.
Use the supported Node 24 LTS binary from nodejs.org, verifying its published
SHA-256 checksum; `/opt/bluebird-node` points at that version. Patch Node and
redeploy this artifact when the inventory implementation changes.

The root-only `/etc/bluebird/inventory.json` contains `url` and `serviceKey` for
the existing production Supabase project. Supply it out of band; never commit
it. systemd `LoadCredential` makes it available only to the isolated service.
The private provider URL stays in the database. The runner generates a one-use
local cron token and never opens a server port.

Install the service/timer in `/etc/systemd/system`, reload systemd, and enable
`bluebird-inventory.timer`. Disable only the former Supabase job named
`dealer-inventory-sweep`, since its website-hosted fetches cannot retrieve this
provider. Leave unrelated jobs untouched. The timer checks every 15 minutes;
the database source controls actual imports (`every 8 hours` for Twin Falls
Subaru), with retry, lease and snapshot safeguards.
The Mac is not involved in scheduled execution.

Run `systemctl start bluebird-inventory.service` for an immediate sweep and
inspect `journalctl -u bluebird-inventory.service` plus source sync history.
A successful first run must match the provider's vehicle/photo counts; a second
sweep within the hour must skip it. Replays must not duplicate records/media.
Pause a source in Bluebird to stop imports. Disable the timer to stop this
worker. Keep a previous release for rollback. This imports private records;
the normal verified dealer/storefront and review process governs publication.

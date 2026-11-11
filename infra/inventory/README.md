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

## SFTP deliveries

`bluebird-sftp-inventory.service` is a separate, five-minute delivery watcher;
it does not change the existing Motive worker or SFTP server permissions. Build
its single-file artifact with the installed bundler:

```
node_modules/.bin/rolldown infra/inventory/sftp-run.mjs --file /private/release/sftp-run.mjs --platform node --format esm
```

Deploy under `/opt/bluebird-sftp-inventory/releases/` and switch `current`
atomically. Apply `20261111210000_sftp_inventory_delivery.sql` first. Keep the
root-only `/etc/bluebird/sftp-inventory.json` outside source control:

```
{"sources":[{"sourceId":"configured-source-uuid","path":"/srv/bluebird-sftp/vendor/incoming/inventory.csv"}]}
```

systemd loads that manifest and the existing database credentials privately.
The read-only, restricted service runs as root with only `CAP_DAC_READ_SEARCH`
to read vendor-owned 0700/0600 uploads, without opening their permissions to
other users. Home directories and SSH configuration are inaccessible. It opens
no network listener and follows no database HTTP redirects.

Only pinned CSV files are read. Symlinks, empty/oversized files, deliveries older
than 72 hours and files modified within the last two minutes are rejected or
deferred; inode, modification time and size must remain stable while reading.
Providers should upload to a temporary name and rename once complete. Each
delivery's content/metadata fingerprint is checkpointed in the same database
transaction as reconciliation. Replaying a delivery does not advance missing
vehicle counts; a new received export can refresh identical inventory. Failed
validation or reconciliation leaves the previous snapshot intact.

`onboard-sftp-dealer.mjs` is an operator-only, one-time helper bundled the same
way. It reads all contacts and source bindings from a private configuration,
reuses the standard dealer onboarding function, and never sends an invitation.
Publication stays disabled until the first import and public-data checks pass.

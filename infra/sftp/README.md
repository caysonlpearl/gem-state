# Bluebird SFTP receiver

Dedicated Ubuntu 24.04 LTS server, initially DigitalOcean Basic Regular 1 GB / 1 CPU / 25 GB, listed at $6/month before tax. This directory prepares the receiver only. It does not create a cloud account, purchase a server, publish dealer inventory, or automatically import unreviewed uploads.

## Deploy

1. Add the operator's SSH public key to the DigitalOcean server creation form. Administrator access must use a key. Do not put private keys in user data or this repository.
2. Run `python3 infra/sftp/render-user-data.py /private/tmp/bluebird-sftp-user-data.yaml` and use the resulting file as the new server's startup script/user data.
3. Create `bluebird-sftp-01` on Ubuntu 24.04 LTS using the quoted $6 plan. Use only the agreed server and options. Cloud firewall, if enabled, must permit TCP 22. No DNS is required for the first upload test; use the assigned IP.
4. After first boot, use DigitalOcean's authenticated server console to obtain the SSH host fingerprint and pin it before the first administrator SSH connection. Check `cloud-init status --wait`, `sshd -t`, `systemctl is-active ssh fail2ban`, and `ufw status` using the administrator key.
5. Use `/usr/local/sbin/bluebird-sftp-account overfuel --password` to check account status. The initial setup already creates this account; repeating the command preserves its existing password. Passwords are generated on the server and retained only in the root-readable `/root/bluebird-sftp-credentials/bbfeed_overfuel.json` file. Retrieve the credential securely; never paste it into logs, source control or chat.
6. Retrieve `/var/lib/bluebird-sftp/host-key-fingerprint.txt` over the authenticated admin connection and pin that host key before testing SFTP. Do not disable host-key checking.
7. Test upload of the synthetic sample CSV. Confirm it arrives unchanged in `/srv/bluebird-sftp/bbfeed_overfuel/incoming`, and confirm the vendor cannot obtain a shell, forward ports or access files outside its jail.

## Vendor handoff

- Host: assigned IP or a subsequently verified DNS name.
- Protocol: SFTP (SSH), TCP port 22.
- User: `bbfeed_overfuel`.
- Remote upload directory: `/incoming` (the provider cannot see the server's `/srv/...` path).
- Filename: the provider's agreed per-dealer convention; use a `.part` suffix until upload completes, then rename to `.csv`.
- Password: share separately through the agreed secure channel.
- Host key: supply the pinned SHA256 fingerprint.
- Sample: `output/overfuel/bluebird-inventory-sample.csv` in the parent Bluebird workspace. It contains synthetic inventory and illustrative image URLs only.

Create other vendor accounts with `bluebird-sftp-account vendorname --public-key /root/vendor.pub` or `--password`. Each receives a separate filesystem jail. Existing accounts are never silently modified or rotated by this command. If interrupted setup leaves an unregistered account, inspect and repair it manually rather than rerunning blindly.

## Import boundary

An accepted SFTP upload is a private staged file. Inventory ingestion still needs a reviewed per-dealer source mapping and a separate integration with Bluebird's import pipeline. Its publication and snapshot-handling gaps identified in the integration audit must be addressed before enabling unattended public listing updates. Do not point a web server at `/srv/bluebird-sftp` or place Supabase service credentials in vendor-accessible folders.

## Sources

Local verification: `python3 infra/sftp/verify.py` runs the installed OpenSSH configuration parser and checks effective vendor restrictions, administrator access, file permissions, and deployment rendering. It does not open a listener or replace the required live-server upload and isolation tests.

- [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean user data](https://docs.digitalocean.com/products/droplets/how-to/provide-user-data/)
- [OpenSSH server configuration](https://man.openbsd.org/sshd_config)

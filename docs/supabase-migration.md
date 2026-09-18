# Supabase migration

This application is now configured to run its browser auth, server auth, database, storage, and RPC calls directly against the Supabase project in `supabase/config.toml` (`udxxfuticbxwiehoepeg`). Lovable is no longer required for OAuth, preview-session storage, error reporting, Stripe return-url handling, or the Vite build wrapper.

## Required deployment configuration

Copy `.env.example` to the environment used by the deployment and fill in the values without committing the resulting file:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are exposed to the browser.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are used by server-side auth verification.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and is required for admin operations.
- `SUPABASE_DB_URL` is only for Drizzle tooling. It is not needed by the running site.
- `PARKVAULT_SITE_URL` must be the deployed HTTPS origin used for Stripe redirects.
- `CRON_SECRET` and, during rotation, `CRON_SECRET_PREVIOUS` protect scheduled jobs.

The Supabase Auth dashboard must also allow the deployed origin and its `/auth` callback URL. Google and Apple providers must be configured in Supabase Auth; the app now calls `supabase.auth.signInWithOAuth` directly.

## Database and storage

The repository already contains the Supabase migrations under `supabase/migrations/` and uses Supabase Storage buckets from the application. Before changing the remote database, inspect the linked project and take a backup. Use the Supabase CLI to compare or apply migrations only after confirming that the linked project is the intended production project; do not reset the remote database.

## Email delivery

Supabase Auth can deliver signup and password-reset messages after its email/SMTP settings are configured. Marketplace notification emails use Resend first through `RESEND_API_KEY`; `LOVABLE_API_KEY` remains only as a compatibility fallback. For testing, `RESEND_FROM_EMAIL` may use `Gem State Classifieds <onboarding@resend.dev>` and can only reliably deliver to the Resend account's allowed test recipient. Verify a Gem State sending domain before production launch.

Saved-search alerts run immediately after an approved listing and can also be swept by `POST /api/internal/saved-searches`. That endpoint requires `Authorization: Bearer $CRON_SECRET`.

## Web hosting

Supabase is the backend, not the host for this TanStack Start application. The standalone Vite config preserves the current Nitro `cloudflare-module` output. Deploy the generated `.output` to the selected web host and set the same environment variables there. `NITRO_PRESET` can be set for a different Nitro-supported target after that deployment has been tested.

For Cloudflare Workers, the generated worker exposes both `fetch` and `scheduled` handlers. Configure a cron trigger (every 15 minutes is sufficient for the saved-search sweep), then set these server-only secrets: `GEM_STATE_SUPABASE_URL` or `SUPABASE_URL`, `GEM_STATE_SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, and optionally `RESEND_FROM_EMAIL`. Never expose the service-role or Resend keys as `VITE_*` variables.

## Cutover checklist

1. Configure Supabase Auth providers, redirect URLs, email templates/SMTP, and storage policies.
2. Set browser and server Supabase variables in the selected web host.
3. Verify login, logout, OAuth callback, protected server functions, listing reads/writes, media upload, and Stripe webhook handling.
4. Migrate marketplace transactional email to the chosen provider and verify every template.
5. Remove `@lovable.dev/email-js`, the `/lovable/email/*` preview/webhook routes, and any remaining Lovable-only environment variables.
6. Disable the old Lovable deployment only after the independent deployment passes the smoke checks.

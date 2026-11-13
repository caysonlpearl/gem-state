# Account deletion implementation ledger

The approved launch requires operational deletion/anonymization, including auth,
public user content, private history, device tokens and personal media, with
explained retention exceptions. Receiving a request is not completion.

## Authoritative preflight — November 12, 2026

The owning Supabase project is GemList (udxxfuticbxwiehoepeg). A read-only
query against pg_constraint verified actual foreign keys. No member data was
read or deleted. Database size at that observation was 246,074,515 bytes and
there were 25 pg_stat_activity connections; these are observations, not a
capacity/latency guarantee.

Important relationships for the processor:

- Auth sessions, identities and most account settings cascade from auth.users.
- Orders.buyer_id also cascades; hard-deleting auth first would erase orders.
- Products.created_by is SET NULL, leaving public text/images unless explicitly
  removed/anonymized.
- Seller_profiles and notifications are not in that auth-FK list and need
  explicit account-scoped cleanup.
- Shopping_privacy/favorites/experiments use text subjects and need explicit
  account-subject cleanup.
- Some audit/claim/financial relationships restrict auth deletion, including
  sourcing assignments/tips/checkouts, managed-seller claims, photo migration
  authorship, dealer feed authorization and report-event actors.
- Cloud/object storage must be inventoried before removing row references.
  Supabase Auth refuses deletion while the account owns storage objects.
  R2 originals/thumbnails are keyed through private photo receipts, not merely
  by an account-prefix listing.

## Current behavior and remaining work

The mobile request route verifies bearer ownership and the DELETE confirmation,
stores an idempotent request, removes phone tokens, disables mobile advertising,
withdraws shopping alerts, suppresses queued shopping delivery and blocks further
mobile writes. The web deletion-request page uses the same route.

Next processor work must:

1. Claim a durable request with a lease and retries; preserve a minimal completion
   receipt after auth removal, without retaining a plaintext email in worker logs.
2. Immediately revoke sessions/access and optional first-party/advertising work;
   exclude deletion-pending members from web and native optional delivery.
3. Build a per-account deletion/media plan before erasing references; preserve
   required financial/dispute/security records under explicit retention categories.
4. Remove personal profiles, original authored public content, private history,
   saves/settings, uploads, native registrations and private mobile message-retry receipts. Clear or anonymize linked
   analytics and audit data without changing other members' content or falsely
   preserving access.
5. Revoke Apple authorization when linked, then remove auth identity. For records
   that must remain, irreversibly anonymize identity rather than labeling reversible
   deactivation as deletion.
6. Verify all cleanup steps and only then mark completion. A failed provider/media
   cleanup must remain pending/retrying, never completed.
7. Exercise ordinary, dealer, claimed-seller, multiple-device and retained-dispute
   cases with synthetic data; verify a deleted account cannot refresh/sign in and
   that public personal content/media is gone.

These steps have not yet been completed. Do not submit the app or present a
pending request as a completed deletion.

The owner deferred finishing paid developer enrollment on November 13 so app
implementation can continue first. Deletion processing, synthetic account/media
cleanup tests and shared website/app enforcement can proceed before enrollment.
Apple authorization revocation must have a tested provider adapter and must fail
closed for linked accounts until its required credentials are configured. Do not
delete real accounts to prove the processor or silently skip a failed cleanup.

Sources: Supabase's deleteUser and user-data-management documentation, checked
during this preflight. Soft deletion is irreversible in Supabase Auth, but auth
deletion alone does not remove all application personal data.

- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- https://supabase.com/docs/guides/auth/managing-user-data

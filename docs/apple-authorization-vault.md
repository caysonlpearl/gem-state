# Verified Apple authorization storage

This source batch prepares credential capture for an already authenticated
Bluebird member with a real Apple identity. It does not enable Sign in with Apple,
change login, run account deletion or install a scheduler. It depends on the
records-work branch and its disabled deletion prerequisites. Do not install this
migration or wire capture into production until the complete authorization
revocation/cleanup coordinator and owning-project preflight are ready.

## Ownership and provider verification

`createAppleAuthorizationCapture` takes a server-derived account and session,
not an email match or a client-provided provider identity. A fresh privileged
Supabase Auth read supplies the independent identity UUID and Apple subject.
Supabase's API calls those fields `identity_id` and `id`, respectively; database
columns are `id` and `provider_id`. User metadata is never ownership evidence.

The supplied refresh token goes only to Apple's fixed HTTPS token endpoint,
with a five-minute ES256 client secret. `jose` verifies the returned RS256 ID
token against Apple's fixed public-key endpoint, canonical issuer, exact client
audience, expiry, issue time and subject. When present, `at_hash` must match the
access token. Account ownership is reread before storing. SQL then independently
checks the live session, deletion withdrawal and actual Apple identity under the
same account lock used by deletion requests. No raw token or subject goes to RPC.

The factory's request-scoped privileged client must bind the supplied deadline
to **both Auth and RPC fetches**, using the same project as the vault keyring.
An endpoint must derive account/session from a validated request credential;
this library is not an unauthenticated upload endpoint. It has a 30-second
deadline, bounded provider response bodies, fixed destinations, no redirect
following and no automatic provider or database mutation replay. Any failure
returns only `authorization_unavailable`, never raw provider/SQL diagnostics.

## Encrypted storage and recovery

AES-256-GCM uses a fresh 96-bit nonce and authenticated metadata binding project,
account, identity, client, key version and fingerprints. HKDF derives separate
encryption and HMAC keys from a private 32-byte root. Token fingerprints use HMAC;
raw subjects are encrypted and their comparison fingerprint is SHA-256. Database
rows contain ciphertext, nonsecret client identifiers, fingerprints and version
metadata. Keys and provider signing credentials belong in private server secret
configuration, never source, client bundles, logs or database rows. No production
keys were generated or configured by this batch.

Keep retained key versions available until their credentials have been safely
revoked and removed. Rotation can read old envelopes and writes with the active
version. Key loss and corrupt ciphertext are operational failures; they are not
evidence that authorization was revoked or that a manual fallback is appropriate.

A verified envelope can be reused for 24 hours after an interrupted save or
repeated callback. Recovery decrypts and validates the envelope, including the
original refresh token and current identity. After expiry, a fresh Apple proof
updates the same row. A committed save followed by a lost HTTP acknowledgement
does not trigger another provider refresh on the next attempt. Concurrent new
captures can still both contact Apple; a future endpoint must avoid concurrent
callback dispatch. This is not a periodic token-polling job.

## Database boundary

RLS is enabled, with no direct table access even for `service_role`. Only two
private server RPCs provide capture/cache access. End users cannot call them.
Auth identities must not be member-writable, and the migration pins relevant
Auth schema/privileges as well as vault columns, constraints, hooks, policies and
function definitions. Drift stops capture and completion for review. Migration
preflight requires the existing worker to remain disabled and existing account,
private-record and financial-ledger barriers to be current.

Vault account/identity references deliberately do not cascade on Auth deletion
or identity unlinking. Unlinking retains credentials for revocation; an Auth
user-deletion trigger refuses removal while any remain. A separate completion
trigger also rejects a success receipt while credentials or schema uncertainty
remain. These are backstops, not a finished deletion worker. Revocation receipts,
credential removal, legacy missing-token instructions, Auth deletion and
independent whole-workflow verification remain to be connected. Genuine legacy
missing-token cases must still allow account-data deletion, as Apple specifies.

## Verification and limits

Tests use disposable PostgreSQL/PGlite, real Supabase SDK calls routed to the
disposable database, generated RSA signatures/public keys and generated ECDSA
client credentials. Tests cover lost acknowledgement recovery, ownership/subject
mismatch, invalid signatures and claims, stale/corrupt storage, key rotation,
cancelled or oversized responses, logout/deletion during capture, SQL access
denials, immutable ownership, completion guards and schema/ACL drift. Native
PostgreSQL tests observe both concurrent account-lock orders. The minimal Auth
fixture follows Supabase's documented model; it is **not** a captured or verified
production Auth schema. No real Apple request, sign-in, token revocation, member
erasure or provider configuration change occurs in these tests.

References:

- [Apple TN3194: account deletion and token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
- [Supabase Auth identity model](https://github.com/supabase/auth/blob/master/internal/models/identity.go)
- [jose](https://github.com/panva/jose)

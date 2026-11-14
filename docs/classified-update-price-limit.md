# Classified listing update price limit

A metadata-only inspection of GemList on November 14, 2026 found that the
classified form, outer update RPC and `asks_price_cents_check` already allow
1,000,000,000 cents ($10 million). The inner `update_ask` helper still rejected
prices above 5,000,000 cents ($50,000). Expensive vehicles and homes could be
created or imported at valid prices but rejected when their owners edited them.

`20261114170000_classified_update_price_limit.sql` replaces that one upper-bound
predicate in the reviewed, live helper. It changes no listing row, table
constraint, lower bound, ownership check, approval reset or event behavior. It
preserves all function attributes, including owner, grants and access guard.
The guard's original and active source fingerprints update in the same
transaction; failed bookkeeping rolls back the function change. Unrecognized
source, guard drift or missing prerequisites stop the migration. Reapplication
accepts only the exact corrected body with consistent guard bookkeeping.

This independent correction requires the already-installed account access
boundary migration and zero coverage gaps. It does not install or activate the
separately held deletion, media or native-management migrations. Record its exact
migration source/history and re-read the function, attributes, guard and coverage
when applying it; a repository merge is not proof of database installation.

The regression fixture contains the actual inspected helper definition and its
original guard source, with no member records or credentials. Disposable local
SQL tests reproduce the original rejection, then exercise valid prices from $1
to $10 million, rejection outside that range, event/approval behavior, foreign
ownership, inactive listings and expired sessions. They verify unchanged
function attributes, no listing writes during migration, rejected source drift,
transaction rollback and safe reapplication. They do not establish a real
seller edit or the full native Listings rollout.

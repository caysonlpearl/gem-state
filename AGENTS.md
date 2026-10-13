## Project guidance

This repository is deployed independently of the original hosted builder. Keep
Supabase credentials server-side where required, preserve the generated route
tree when routes change, and verify production configuration before deployment.

## TypeScript configuration

Category landing listing sections retain their headings and navigation when empty and use the shared Bluebird empty-state component; hardcoded showcase metadata must not supply listing cards, so empty inventory remains honest without deleting database records.

Keep `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes` off in tsconfig.json. These three extra-strict
settings flag safe code across the whole app (index-signature property access,
index reads, and optional-property spreads) without catching real bugs; the
codebase is deliberately written against `strict: true` only. If a fresh
typecheck floods with TS4111/TS2375/TS18048 errors, restore these settings to
`false` before hand-fixing files.

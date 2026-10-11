## Project guidance

This repository is deployed independently of the original hosted builder. Keep
Supabase credentials server-side where required, preserve the generated route
tree when routes change, and verify production configuration before deployment.
- TypeScript uses `strict` without `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes` — those flags produced hundreds of non-bug errors across synced code and blocked the preview build.

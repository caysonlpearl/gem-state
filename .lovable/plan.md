# Connect the app to your own Supabase project (udxxfuticbxwiehoepeg)

Right now the app is still bound to the built-in backend (project qgxmlzsnfqmvsetpzisz) — browser sign-in, database, and storage all point there. The goal is to point everything at your restored Supabase project `udxxfuticbxwiehoepeg` instead, without changing any Gem State UI or marketplace code.

## Step 1 — you do this (about 2 minutes)

The switch between the built-in backend and your own Supabase account happens in **Project Settings → Integrations → Supabase**, and only you can make it:

1. Open Project Settings → Integrations → Supabase.
2. Choose to disconnect the built-in backend and connect your own Supabase project `udxxfuticbxwiehoepeg`. You may be asked to authorize the Supabase connection for this workspace.

Important: disconnecting the built-in backend is **permanent** — that backend (and its copy of the data) can't be re-attached. Your backup zip from earlier is already in your files, and your restored project already holds all tables, rules, accounts, and photos, so this is safe to do. But once you disconnect, the app must finish being re-pointed before the site works again, so plan to do the switch and let me finish in one sitting.

## Step 2 — I do this

1. Re-derive the server-side settings for the newly connected project: the public URL/key for the browser and the server-only service-role setting. The values are fetched through the workspace's Supabase authorization — secret values are never shown, pasted, or written into the code.
2. Restart the app so the new settings take effect.
3. Verify the app actually runs on your project:
   - Home, browse, listing, and sign-in pages load.
   - Public listing reads come from your project's database.
   - Sign-in session attaches to protected actions.
4. Report what works and flag anything your project still needs (for example: sign-in providers, email sending, and the allowed redirect addresses for the live site, which are configured inside your Supabase project's settings).

## Notes

- No code, UI, or marketplace-flow changes are part of this plan — only which backend the existing code talks to.
- Stripe and shipping keys are unchanged; those are separate secrets that carry over.
- If the connection step in Project Settings fails (usually a revoked or missing Supabase authorization for the workspace), I'll tell you what to reconnect and we retry.

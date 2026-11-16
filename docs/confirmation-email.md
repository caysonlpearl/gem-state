# Signup confirmation email

## Scope and status

This is a signup-email refinement within the existing Bluebird brand. It keeps the real Marketplace logo, cream canvas, navy action, and soft corners found in the website's brand assets and `src/styles.css`. It does not establish a new brand system or change other Auth email types. Brand configuration and assets remain unchanged.

Source design review passed with disposition **ship** and no material fixes. Local type checking, targeted linting, renderer assertions and the website build passed. On November 16, the production Supabase Confirm signup subject and body were saved and then re-read after a dashboard reload: the installed body matched the generated HTML byte for byte, with one unchanged confirmation placeholder. The inactive Lovable hook source is maintained here too; its website publication is separate from this live Supabase change. A newly delivered inbox check remains unverified; this work does not prove improved spam placement.

## Source and generation

- `src/lib/email-templates/signup.tsx` owns signup copy, styles, and the subject `Confirm your Bluebird account`.
- `src/routes/lovable/email/auth/webhook.ts` uses that component and subject for the Lovable signup path, passing the provider's `data.url` through unchanged.
- `scripts/render-signup-email.mjs` generates `supabase/templates/confirm-signup.html` and `supabase/templates/confirm-signup.subject.txt` from the same component.

With the project's dependencies installed, run from the repository root:

```sh
node scripts/render-signup-email.mjs
```

The command also writes `.output/signup-email/preview.html` and `preview.txt`. Those previews contain a deliberately synthetic signup token and a mobile callback destination; never install the preview HTML as a live template. Review and commit regenerated template changes alongside their source.

The generator asserts that the exact Supabase placeholder `{{ .ConfirmationURL }}` appears **once** in the installable HTML. Preserve its spelling, spaces, braces, and case. Do not substitute a preview URL, rebuild the Auth URL, alter its token/query/redirect destination, or add tracking redirects. Assertions also verify that the synthetic provider URL survives rendering and plain-text conversion intact, that links are limited to the supplied Auth URL, `https://onbluebird.com`, and `https://onbluebird.com/contact`, and that the HTML stays below 20 KB without scripts, forms, or iframes. The logo is the existing public brand image, not a tracking pixel.

## Visual contract

Use the cream outer field (`#f8f6ef`) and white message card with a quiet border (`#e6e2d9`), 16px corners, and a 520px maximum container. Keep the existing 192 × 78 logo above the message. The email uses Arial/Helvetica fallbacks for client compatibility, a restrained 26px heading with 34px line height, and 16px body text with 26px line height. This email-specific font stack does not replace the website's Manrope/Sora typography.

Keep one navy (`#223a47`) confirmation action, approximately 48px high in the reviewed rendering, followed by the ignore-if-unrequested explanation. Keep the understated site/contact footer. The generated table layout and inline styles support email clients; the media query reduces outer/card padding below 600px. Client support can vary.

## Live installation and verification

Deploying the website or changing the Lovable source does **not** install the Supabase-managed signup email. Confirm which sending path handles the real signup before treating either update as live.

For the Supabase Confirm signup template, save the current live subject and HTML as a dated backup before editing. Install the contents of `supabase/templates/confirm-signup.subject.txt` as the subject and `supabase/templates/confirm-signup.html` as the body, then save and re-read both fields to verify the exact placeholder survived. Keep a record of the project, time, previous template, and installed source revision. The November 16 installation was on GemList production (`udxxfuticbxwiehoepeg`); the backup, saved-settings screenshot and verification receipt are in the local task output at `output/confirmation-email-design-20261116` under the Bluebird workspace.

After installation, request a fresh controlled signup and inspect the newly received message in Gmail and the intended mobile client. Check the logo, copy, button, footer, and final confirmation return destination. Use a fresh account/link to distinguish delivery and confirmation from an expired or already-used token. Inbox placement, sender reputation, authentication headers, and real-client rendering require that delivered-message evidence.

To roll back a Supabase change, restore the backed-up live subject and HTML, save, and re-read them. To roll back the Lovable path, restore the previously deployed signup component/subject revision and redeploy that source. Preserve the Auth-generated action URL in either path.

## Review evidence and limits

The reviewed local render is captured in `.impeccable/review/mobile.png` (440 × 650), `narrow.png` (320 × 740), and `desktop.png` (760 × 700), with copies in the local task output. These captures show the generated layout at the stated viewport sizes. They do not demonstrate a Supabase send, Gmail rendering, dark-mode behavior, image-blocked behavior, Outlook compatibility, a successful real confirmation, or inbox placement. The finish review covered persistence, fidelity, ceiling, material fixes, and elements to keep; no material fixes remained. The dashboard preview displayed the image fallback even though the same public PNG opened correctly in Chrome, loaded in the local renders, and returned identical image data with Supabase/Gmail referrers; real inbox image rendering remains an explicit verification limit.

/**
 * Public (browser-safe) Supabase connection values for the Gem State
 * Classifieds backend, project ref `udxxfuticbxwiehoepeg`.
 *
 * These are publishable values — the same URL and anon key the browser sends
 * with every request — so committing them is safe. They exist as a fallback
 * because the hosted production build does not always inject the
 * `VITE_SUPABASE_*` variables for an externally connected Supabase project,
 * which left the published bundle with no backend address at runtime.
 */
export const PUBLIC_SUPABASE_URL = "https://udxxfuticbxwiehoepeg.supabase.co";

export const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkeHhmdXRpY2J4d2llaG9lcGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTcxNDMsImV4cCI6MjEwNTIzMzE0M30.YEj-okbKL_USQ1LV4i0nfgBs1yubTFMBuwo20qW6Ii0";

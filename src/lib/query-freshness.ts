/**
 * How long server-rendered public page data counts as fresh in the browser.
 * Without it the page refetches everything right after hydrating, which
 * repeats the server work and re-signs every photo URL.
 */
export const PUBLIC_PAGE_STALE_MS = 60_000;

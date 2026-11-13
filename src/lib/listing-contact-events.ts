/** Shared contact intent events contain no private message content. */
export const OPEN_CONTACT_EVENT = "bluebird:open-contact";
export const OPEN_LISTING_MESSAGE_EVENT = "bluebird:open-listing-message";

// Survives the round trip through Google or the full sign-up page, so the
// buyer lands back on the listing with the message form already open.
const OPEN_CONTACT_KEY = "bluebird:open-contact-listing";

export function rememberContactIntent(listingId: string) {
  try {
    sessionStorage.setItem(OPEN_CONTACT_KEY, listingId);
  } catch {
    // Private mode or blocked storage: they just won't auto-open the form.
  }
}

export function consumeContactIntent(listingId: string): boolean {
  try {
    if (sessionStorage.getItem(OPEN_CONTACT_KEY) !== listingId) return false;
    sessionStorage.removeItem(OPEN_CONTACT_KEY);
    return true;
  } catch {
    return false;
  }
}

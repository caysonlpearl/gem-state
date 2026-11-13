import { brand } from "../config/brand";
import { listingReturnTarget, authReturnSearch, type AuthReturnPath } from "./auth-return-path";

// Tell people why they're being asked to sign in, based on where they were
// headed -- a generic "sign in" at the moment of posting or messaging reads
// as a wall rather than a step.
export function authIntent(redirect: AuthReturnPath) {
  if (listingReturnTarget(redirect)?.edit) {
    return {
      signinTitle: "Sign in to edit your listing",
      signupTitle: "Sign in to edit your listing",
      body: "We’ll bring you back to your listing after you sign in.",
    };
  }
  if (redirect.startsWith("/listings/")) {
    return {
      signinTitle: "Sign in to message the seller",
      signupTitle: "Create an account to message the seller",
      body: "You'll come right back to the listing with your message ready to send.",
    };
  }
  if (
    redirect === "/create-listing" ||
    redirect.startsWith("/create-listing?") ||
    redirect === "/create-missing-listing" ||
    redirect === "/seller-setup" ||
    redirect === "/selling"
  ) {
    return {
      signinTitle: "Sign in to post your listing",
      signupTitle: "Create an account to post your listing",
      body: "Posting is free. Buyers across Idaho contact you directly.",
    };
  }
  if (redirect === "/watchlist") {
    return {
      signinTitle: "Sign in to see your saved items",
      signupTitle: "Create an account to save listings",
      body: "Save listings and searches, and get alerts when something new matches.",
    };
  }
  if (redirect === "/messages" || authReturnSearch(redirect).section === "messages") {
    return {
      signinTitle: "Sign in to see your messages",
      signupTitle: "Create an account to message sellers",
      body: "Your conversations with buyers and sellers live here.",
    };
  }
  return {
    signinTitle: `Sign in to ${brand.name}`,
    signupTitle: `Create your ${brand.name} account`,
    body: "An account is needed to save listings, contact sellers and post on the marketplace.",
  };
}

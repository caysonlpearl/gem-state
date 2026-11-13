import { JobApplicationFormView } from "../../../src/components/classifieds/JobApplicationFormView";
import { useCurrentListingDetail } from "./ListingDetail";
import { submitNativeApplication } from "./application-attempts";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { trackShopping } from "./shopping";
import { trackAdvertising } from "./advertising";
export function NativeJobApplicationForm({ listingId }: { listingId: string }) {
  const { owner, applicationsReady } = useCurrentListingDetail();
  if (!owner) return null;
  return (
    <JobApplicationFormView
      listingId={listingId}
      runtime={{
        ready: applicationsReady,
        getApplication: () =>
          api(`listings/${listingId}/application`, "GET", undefined, undefined, {
            userId: owner,
            installId: installIdentifier(),
          }),
        onSubmit: ({ resume, application, coverLetter }) =>
          submitNativeApplication(owner, listingId, resume, application?.resumePath, coverLetter),
        onSubmitted: () => {
          trackShopping("contact", listingId, { method: "apply" });
          void trackAdvertising("seller_contacted", "jobs");
        },
      }}
    />
  );
}

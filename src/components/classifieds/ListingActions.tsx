import { useAuth } from "@/hooks/useAuth";
import { trackCompletedInquiry, trackSellerContact } from "@/lib/analytics";
import { startConversation } from "@/lib/conversation.functions";
import { shoppingTrack } from "@/lib/shopping-client";
import { useServerFn } from "@tanstack/react-start";
import { ContactSignInSheet } from "./ContactSignInSheet";
import { JobApplicationForm } from "./JobApplicationForm";
import { ListingActionsView, type ListingActionsProps } from "./ListingActionsView";
export function ListingActions(props: ListingActionsProps) {
  const { isSignedIn, user } = useAuth();
  const start = useServerFn(startConversation);
  return (
    <ListingActionsView
      {...props}
      runtime={{
        isSignedIn,
        userId: user?.id,
        onSend: (data) => start({ data }),
        onContact: trackSellerContact,
        onCompletedInquiry: trackCompletedInquiry,
        onContactOpened: () =>
          shoppingTrack("contact_open", props.listing.id, { method: "message" }),
        ContactSignInSheet,
        JobApplicationForm,
      }}
    />
  );
}

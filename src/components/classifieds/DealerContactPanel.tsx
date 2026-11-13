import { WebsiteStorefrontLink } from "@/components/storefronts/WebsiteStorefrontLink";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { startDealerConversation } from "@/lib/conversation.functions";
import { trackBusinessEvent } from "@/lib/business-analytics";
import { DealerContactPanelView } from "./DealerContactPanelView";
import type { BusinessIdentity } from "@/lib/business-performance";
export function DealerContactPanel(props: {
  dealerId: string;
  name: string;
  slug: string;
  ownerUserId?: string;
  compose?: boolean;
  business?: BusinessIdentity;
}) {
  const { isSignedIn, user } = useAuth(),
    start = useServerFn(startDealerConversation);
  return (
    <DealerContactPanelView
      {...props}
      runtime={{
        isSignedIn,
        userId: user?.id,
        Link: WebsiteStorefrontLink,
        onSend: (data) => start({ data }),
        onSent: (id) => {
          if (props.business)
            trackBusinessEvent("business_inquiry_completed", props.business, {
              event_id: "dealer-inquiry:" + id,
            });
        },
      }}
    />
  );
}

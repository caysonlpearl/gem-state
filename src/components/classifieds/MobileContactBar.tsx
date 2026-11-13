import { useAuth } from "@/hooks/useAuth";
import { trackSellerContact } from "@/lib/analytics";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";
import { MobileContactBarView } from "./MobileContactBarView";
export function MobileContactBar({ listing }: { listing: ClassifiedDetail }) {
  const { isSignedIn, user } = useAuth();
  return (
    <MobileContactBarView
      listing={listing}
      isSignedIn={isSignedIn}
      userId={user?.id}
      onContact={trackSellerContact}
    />
  );
}

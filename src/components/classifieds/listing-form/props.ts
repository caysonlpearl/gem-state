import type { ClassifiedListingEditor } from "@/lib/classifieds.functions";

export type ListingFormProps =
  | { mode: "create"; duplicateFrom?: ClassifiedListingEditor | undefined }
  | { mode: "edit"; listingId: string; initial: ClassifiedListingEditor; status: string };

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { classifiedCategories } from "@/config/classifieds";
import { shoppingPrivacy } from "@/lib/shopping-client";
import { listingParam } from "@/lib/listing-url";
import type { ClassifiedsHome } from "@/lib/classifieds.functions";
import type { ComponentProps } from "react";
import { SearchSuggestions } from "./SearchSuggestions";
export function WebsiteSearch({
  onCategory,
  ...props
}: Omit<
  ComponentProps<typeof SearchSuggestions>,
  "onCategory" | "onListing" | "listings" | "categories" | "allowRecent" | "owner"
> & { onCategory?: (slug: string) => void }) {
  const client = useQueryClient(),
    navigate = useNavigate(),
    { user } = useAuth();
  const home = client.getQueryData<ClassifiedsHome>(["classifieds-home"]);
  return (
    <SearchSuggestions
      {...props}
      owner={user?.id}
      categories={classifiedCategories}
      listings={home ? [...home.motors, ...home.recent] : []}
      allowRecent={() => shoppingPrivacy().personalization}
      onCategory={
        onCategory ?? ((category) => void navigate({ to: "/browse", search: { category } }))
      }
      onListing={(listing) =>
        void navigate({ to: "/listings/$listingId", params: { listingId: listingParam(listing) } })
      }
    />
  );
}

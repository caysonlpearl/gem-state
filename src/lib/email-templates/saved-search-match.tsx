import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  searchName?: string;
  itemName?: string;
  price?: string;
  listingPath?: string;
}

const Email = ({ searchName, itemName, price, listingPath }: Props) => (
  <EmailShell
    preview={`A new listing matches ${searchName ?? "your saved search"}`}
    heading="A saved-search match is here"
    intro={`A new Gem State listing matches “${searchName ?? "your saved search"}”.`}
    facts={[
      { label: "Listing", value: itemName ?? "New marketplace listing" },
      ...(price ? [{ label: "Price", value: price }] : []),
    ]}
    ctaLabel="View listing"
    ctaPath={listingPath ?? "/browse"}
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data["itemName"] ? `New listing: ${data["itemName"]}` : "New saved-search match",
  displayName: "Saved-search match",
  previewData: {
    searchName: "Mountain bike under $1,000",
    itemName: "Trek Fuel EX mountain bike",
    price: "$850",
    listingPath: "/browse",
  },
} satisfies TemplateEntry;

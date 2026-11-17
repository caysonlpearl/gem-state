import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ListingGallery } from "../../src/components/classifieds/ListingGallery";
import { ListingCardView } from "../../src/components/classifieds/ListingCardView";
import { ComparisonProvider } from "../../src/components/marketplace/Comparison";
import { CopyButton } from "../../src/components/marketplace/CopyButton";
import { IdentityPeek } from "../../src/components/marketplace/IdentityPeek";
import { SearchSuggestions } from "../../src/components/marketplace/SearchSuggestions";
import { SavedHeart } from "../../src/components/marketplace/SavedHeart";
import { savedFeedback } from "../../src/components/marketplace/save-feedback";
import { ScrollRail } from "../../src/components/marketplace/ScrollRail";
import { PhotoImage } from "../../src/components/marketplace/PhotoImage";
import { ListingFormView } from "../../src/components/classifieds/listing-form/ListingFormView";
import { useListingFormState } from "../../src/components/classifieds/listing-form/useListingFormState";
import type { ListingCardSummary } from "../../src/lib/listing-card-summary";
import "../../src/styles.css";
const photo = "/images/mock-vehicles/toyota-tacoma.jpg";
const cards: ListingCardSummary[] = [0, 1, 2, 3].map((i) => ({
  id: `car-${i}`,
  title: `${2022 + i} Toyota Tacoma TRD Sport`,
  productId: `p-${i}`,
  productSlug: `car-${i}`,
  priceCents: 3699500 + i * 100000,
  currency: "USD",
  city: "Twin Falls",
  state: "ID",
  region: "Magic Valley",
  categorySlug: "cars-trucks",
  categoryName: "Cars & trucks",
  condition: "used_good",
  fulfillmentMode: "local_pickup",
  createdAt: "2026-11-16T12:00:00Z",
  isFeatured: false,
  imageUrl: photo,
  vehicle: {
    year: 2022 + i,
    make: "Toyota",
    model: "Tacoma",
    trim: "TRD Sport",
    mileage: 34000 + i * 2000,
    bodyStyle: "Truck",
    transmission: "Automatic",
    drivetrain: "4WD",
    fuelType: "Gasoline",
    exteriorColor: "White",
    titleStatus: "Clean",
    vin: null,
  },
}));
function CardLink({ listing, children, className, ariaLabel }: any) {
  return (
    <a href={`#${listing.id}`} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
function Save({ title, owner }: { title: string; owner: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Save ${title}`}
      aria-pressed={saved}
      className="grid h-9 w-9 place-items-center rounded-full bg-card"
      onClick={() => {
        const next = !saved;
        setSaved(next);
        savedFeedback({
          saved: next,
          title,
          current: () => document.body.dataset.owner === owner,
          onUndo: () => setSaved(false),
        });
      }}
    >
      <SavedHeart saved={saved} size={17} />
    </button>
  );
}
function Post() {
  const props = { mode: "create" } as const;
  const state = useListingFormState(props);
  return (
    <ListingFormView
      props={props}
      state={state}
      categories={[{ id: "general", slug: "general", name: "General" }]}
      mutation={{ isPending: false, mutate: () => {} }}
      vinLookup={null}
    />
  );
}
function Fixture() {
  const [owner, setOwner] = useState("one"),
    [term, setTerm] = useState(""),
    [permission, setPermission] = useState(true),
    [result, setResult] = useState("");
  document.body.dataset.owner = owner;
  return (
    <ComparisonProvider owner={owner} listingHref={(item) => `#${item.id}`}>
      <main className="mx-auto max-w-5xl px-4 py-5 pb-32">
        <p className="mb-4 text-xs text-muted-foreground">
          Offline interaction fixture · synthetic listings · no real saves or submissions
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          <button onClick={() => setOwner(owner === "one" ? "two" : "one")}>Switch account</button>
          <button
            onClick={() => {
              setPermission(!permission);
              window.dispatchEvent(new Event("shopping-privacy-changed"));
            }}
          >
            Toggle personalization
          </button>
          <span role="status">{result}</span>
        </div>
        <div className="mb-5 flex items-center gap-2">
          <div className="flex-1 rounded-full border border-border bg-card px-4">
            <SearchSuggestions
              aria-label="Search fixture"
              placeholder="Search listings"
              value={term}
              owner={owner}
              onValueChange={setTerm}
              onSearch={(q) => setResult(`Search: ${q}`)}
              onCategory={(q) => setResult(`Category: ${q}`)}
              onListing={(card) => setResult(`Listing: ${card.id}`)}
              listings={cards}
              categories={[{ slug: "cars-trucks", name: "Vehicles" }]}
              allowRecent={() => permission}
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <CopyButton value="Fixture VIN 123" label="Copy VIN" />
        </div>
        <div className="mb-5">
          <IdentityPeek
            name="Bluebird QA Motors"
            location="Twin Falls, ID"
            bio="Public dealer profile for this offline test."
            action={<a href="#dealer">View dealership and inventory</a>}
          />
        </div>
        <ScrollRail
          aria-label="Fixture listings"
          className="no-scrollbar flex gap-3 overflow-x-auto pb-2"
        >
          {cards.map((card) => (
            <div key={card.id} className="w-[220px] shrink-0">
              <ListingCardView
                listing={card}
                renderLink={CardLink}
                saveAction={<Save key={owner} owner={owner} title={card.title} />}
              />
            </div>
          ))}
        </ScrollRail>
        <h1 className="mb-4 mt-7 text-xl font-semibold">Listing photos</h1>
        <ListingGallery
          listing={{
            ...cards[0],
            images: [
              { url: photo, alt: "Tacoma front" },
              { url: "/images/mock-vehicles/ford-f150.jpg", alt: "Tacoma interior" },
              { url: photo, alt: "Tacoma side" },
            ],
          }}
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="aspect-[4/3]" data-test="failed-photo">
            <PhotoImage
              src="/missing-test-photo.jpg"
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="aspect-[4/3]" data-test="delayed-photo">
            <PhotoImage
              src="/delayed-test-photo.png"
              alt="Delayed listing photo"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
        <h2 className="mt-8 text-xl font-semibold">Post a listing</h2>
        <Post />
      </main>
      <Toaster />
    </ComparisonProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);

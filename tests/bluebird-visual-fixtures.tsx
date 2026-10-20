import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";

import { ListingCardPhoto } from "../src/components/classifieds/ListingCard";
import { CategoryArtwork } from "../src/components/classifieds/CategoryIcon";
import { BluebirdEmptyState } from "../src/components/layout/BluebirdEmptyState";
import "../src/styles.css";

const fixtures = [
  {
    id: "synthetic-sofa",
    title: "Mid-century blue sofa",
    imageUrl: "/fixtures/bluebird-sofa.svg",
    priority: true,
    label: "First visible card · eager / high priority",
  },
  {
    id: "synthetic-dog",
    title: "Golden retriever puppy",
    imageUrl: "/fixtures/bluebird-dog.svg",
    priority: false,
    label: "Following card · lazy",
  },
  {
    id: "synthetic-art",
    title: "Framed floral still life",
    imageUrl: "/fixtures/bluebird-art.svg",
    priority: false,
    label: "Following card · lazy",
  },
];

function App() {
  useEffect(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>("article img")];
    const status = document.getElementById("fixture-status");
    if (status) {
      status.textContent =
        `viewport ${window.innerWidth}×${window.innerHeight} · ` +
        images
          .map(
            (image, index) =>
              `image ${index + 1}: loading=${image.loading}, fetchpriority=${image.getAttribute("fetchpriority") ?? "unset"}`,
          )
          .join(" · ");
    }
    document.documentElement.dataset.fixtureReady = "true";
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          Synthetic local fixture · not live feed data
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Bluebird visual review</h1>
        <p className="text-sm text-muted-foreground">
          Component-level check for listing photo loading and the homepage empty row.
        </p>
      </header>

      <section aria-labelledby="category-pair-heading" className="space-y-3">
        <div>
          <h2 id="category-pair-heading" className="text-lg font-bold">
            Firearms and Pets stay side by side
          </h2>
          <p className="text-xs text-muted-foreground">
            Two-column featured-category layout; categories are kept adjacent.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          {[
            { slug: "pets", title: "Pets & adoption", tone: "bg-brand-blue/7" },
            { slug: "firearms", title: "Firearms & gear", tone: "bg-brand-warm/10" },
          ].map((category) => (
            <div
              key={category.slug}
              className={`flex min-w-0 flex-col items-start gap-2.5 rounded-[20px] border border-primary/15 p-3.5 shadow-sm sm:min-h-[60px] sm:flex-row sm:items-center sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-2 ${category.tone}`}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card/70 sm:size-10">
                <CategoryArtwork slug={category.slug} size={40} />
              </span>
              <span className="min-w-0 text-[15px] font-bold leading-tight tracking-tight sm:text-[16px]">
                {category.title}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="photo-heading" className="space-y-4">
        <div>
          <h2 id="photo-heading" className="text-lg font-bold">
            Representative listing photos
          </h2>
          <p className="text-xs text-muted-foreground">
            SVG artwork below is synthetic. The production ListingCardPhoto component renders each
            image.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {fixtures.map((listing) => (
            <article
              key={listing.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <ListingCardPhoto listing={listing} priority={listing.priority} />
              <div className="space-y-1 p-3">
                <h3 className="truncate text-sm font-semibold">{listing.title}</h3>
                <p className="text-[11px] text-muted-foreground">{listing.label}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="empty-heading" className="space-y-3">
        <h2 id="empty-heading" className="text-lg font-bold">
          Empty listing row
        </h2>
        <BluebirdEmptyState
          headingLevel="h2"
          eyebrow="Bluebird vehicles"
          title="Bluebird is just getting started."
          description="Vehicle listings show up here as soon as Idaho sellers post them. Have one to sell? Be one of the first."
          className="mt-0"
        />
      </section>

      <output
        id="fixture-status"
        className="block rounded-lg bg-secondary p-3 text-xs text-muted-foreground"
      />
    </main>
  );
}

const fixtureRoot =
  import.meta.hot?.data.fixtureRoot ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.fixtureRoot = fixtureRoot;
fixtureRoot.render(<App />);

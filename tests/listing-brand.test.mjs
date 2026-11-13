import test from "node:test";
import assert from "node:assert/strict";
import { resolveListingBrand } from "../src/lib/listing-brand.ts";
import { listingBrandReviews } from "../src/content/listing-brand-reviews.ts";
const base = { id: "unreviewed", title: "Utility equipment" };
test("recognizes explicit seller manufacturer labels and keeps custom/unknown items unbranded", () => {
  assert.equal(
    resolveListingBrand({
      ...base,
      description: "General\n\nYear\n\n2026\n\nManufacturer\n\nPAISANO\n\nModel\n\n4000 GAL",
    }),
    "PAISANO",
  );
  assert.equal(
    resolveListingBrand({ ...base, description: "Brand: Skechers\nLight-up shoes" }),
    "Skechers",
  );
  for (const value of ["CUSTOM", "CUSTOM BUILT", "Generic", "Unknown", "Model"])
    assert.equal(resolveListingBrand({ ...base, description: `Manufacturer\n${value}` }), "");
  for (const description of ["Works with Canon", "Compatible with Apple", "A novel by Jane Smith"])
    assert.equal(resolveListingBrand({ ...base, description }), "");
});
test("reviewed text brands require the current title and quoted evidence", () => {
  const [id, review] = Object.entries(listingBrandReviews).find(
    ([, r]) => r.source === "description",
  );
  const input = { id, title: review.title, description: review.quote };
  assert.equal(resolveListingBrand(input), review.brand);
  assert.equal(resolveListingBrand({ ...input, title: "Replacement item" }), "");
  assert.equal(resolveListingBrand({ ...input, description: "Changed description" }), "");
  assert.equal(
    resolveListingBrand({ ...input, itemDetails: { brand: "Seller correction" } }),
    "Seller correction",
  );
});
test("reviewed photographs require the same listing title, image identity and position", () => {
  const [id, review] = Object.entries(listingBrandReviews).find(([, r]) => r.source === "photo");
  const input = {
    id,
    title: review.title,
    media: [{ id: review.photoId, position: review.photoIndex }],
  };
  assert.equal(resolveListingBrand(input), review.brand);
  assert.equal(resolveListingBrand({ ...input, media: [] }), "");
  assert.equal(
    resolveListingBrand({ ...input, media: [{ id: "replacement", position: review.photoIndex }] }),
    "",
  );
  assert.equal(resolveListingBrand({ ...input, title: "Replacement item" }), "");
  assert.equal(
    resolveListingBrand({ ...input, media: [{ id: review.photoId, position: 99 }] }),
    "",
  );
});
test("known title brands remain bounded and compatibility is not manufacturer evidence", () => {
  assert.equal(resolveListingBrand({ ...base, title: "Canon camera" }), "Canon");
  assert.equal(resolveListingBrand({ ...base, title: "Canonical camera" }), "");
  assert.equal(resolveListingBrand({ ...base, title: "Case for Canon" }), "");
  assert.equal(resolveListingBrand({ ...base, vehicleMake: "Ford" }), "Ford");
});

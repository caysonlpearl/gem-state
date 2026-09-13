import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  adminAddProductImage,
  adminDeleteProductImage,
  adminGetProductDetail,
  adminSaveVariant,
  adminSearchProducts,
  adminUpdateProduct,
  adminUpdateProductImage,
  getAdminCatalogConsole,
} from "@/lib/admin-catalog.functions";

const CATALOG_MEDIA_BUCKET = "catalog-media";

/**
 * Uploads owned catalog photography into the private administrator bucket and
 * returns the public delivery path that catalog pages read.
 */
async function uploadCatalogPhoto(productId: string, file: File) {
  const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const objectPath = `${productId}/${crypto.randomUUID()}.${extension || "jpg"}`;
  const { error } = await supabase.storage.from(CATALOG_MEDIA_BUCKET).upload(objectPath, file, {
    cacheControl: "31536000",
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) throw new Error(error.message);
  return `/api/public/catalog-media/${objectPath}`;
}

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({
    meta: [
      { title: "ParkVault catalog page editor" },
      {
        name: "description",
        content:
          "Administrator-only editor for every detail of an existing ParkVault catalog page: naming, category, resorts, release facts, variations and photo alt text.",
      },
      { property: "og:title", content: "ParkVault catalog page editor" },
      {
        property: "og:description",
        content: "Administrator-only editor for existing ParkVault catalog page details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminProductsPage,
});

const statusOptions = [
  { value: "draft", label: "Draft (hidden)" },
  { value: "pending_review", label: "Pending review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const releaseOptions = [
  { value: "unknown", label: "Unknown" },
  { value: "open_edition", label: "Open edition" },
  { value: "limited_release", label: "Limited release" },
  { value: "limited_edition", label: "Limited edition" },
  { value: "seasonal", label: "Seasonal" },
  { value: "event_exclusive", label: "Event exclusive" },
  { value: "annual_passholder", label: "Annual passholder" },
];

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "block text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground";
const buttonClass =
  "inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-60";

function Panel({
  title,
  children,
  note,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {note ? <p className="mt-1 text-[12px] text-muted-foreground">{note}</p> : null}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

type EditState = {
  name: string;
  slug: string;
  categoryId: string;
  resortCodes: string[];
  brandText: string;
  collectionText: string;
  description: string;
  releaseType: string;
  releaseDate: string;
  retailPrice: string;
  retailPriceSource: string;
  status: string;
};

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const fetchConsole = useServerFn(getAdminCatalogConsole);
  const searchProducts = useServerFn(adminSearchProducts);
  const getDetail = useServerFn(adminGetProductDetail);
  const updateProduct = useServerFn(adminUpdateProduct);
  const saveVariant = useServerFn(adminSaveVariant);
  const updateImage = useServerFn(adminUpdateProductImage);
  const addImage = useServerFn(adminAddProductImage);
  const deleteImage = useServerFn(adminDeleteProductImage);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [variantDrafts, setVariantDrafts] = useState<
    Record<
      string,
      {
        label: string;
        size: string;
        color: string;
        edition: string;
        position: string;
        active: boolean;
      }
    >
  >({});
  const [imageDrafts, setImageDrafts] = useState<
    Record<string, { alt: string; position: string; viewRole: string; file: File | null }>
  >({});
  const [newPhoto, setNewPhoto] = useState<{ alt: string; viewRole: string; file: File | null }>({
    alt: "",
    viewRole: "gallery",
    file: null,
  });
  const [newVariant, setNewVariant] = useState({ label: "", size: "", color: "", edition: "" });

  const console_ = useQuery({ queryKey: ["admin-catalog-console"], queryFn: () => fetchConsole() });
  const results = useQuery({
    queryKey: ["admin-product-search", search],
    queryFn: () => searchProducts({ data: { query: search } }),
    enabled: Boolean(console_.data?.isAdmin),
  });
  const detail = useQuery({
    queryKey: ["admin-product-detail", selectedId],
    queryFn: () => getDetail({ data: { productId: selectedId as string } }),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setEdit({
      name: d.name ?? "",
      slug: d.slug ?? "",
      categoryId: d.categoryId ?? "",
      resortCodes: d.resortCodes ?? [],
      brandText: d.brandText ?? "",
      collectionText: d.collectionText ?? "",
      description: d.description ?? "",
      releaseType: d.releaseType ?? "unknown",
      releaseDate: d.releaseDate ?? "",
      retailPrice: d.retailPriceCents != null ? (d.retailPriceCents / 100).toFixed(2) : "",
      retailPriceSource: d.retailPriceSource ?? "",
      status: d.status ?? "draft",
    });
    setVariantDrafts(
      Object.fromEntries(
        (d.variants ?? []).map((v) => [
          v.id,
          {
            label: v.label ?? "",
            size: v.size ?? "",
            color: v.color ?? "",
            edition: v.edition ?? "",
            position: String(v.position ?? 0),
            active: v.active,
          },
        ]),
      ),
    );
    setImageDrafts(
      Object.fromEntries(
        (d.images ?? []).map((i) => [
          i.id,
          {
            alt: i.alt ?? "",
            position: String(i.position ?? 0),
            viewRole: i.viewRole === "spin" ? "spin" : "gallery",
            file: null,
          },
        ]),
      ),
    );
    setNewVariant({ label: "", size: "", color: "", edition: "" });
    setNewPhoto({ alt: "", viewRole: "gallery", file: null });
  }, [detail.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-product-detail", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-product-search"] });
  };

  const productMutation = useMutation({
    mutationFn: () => {
      if (!selectedId || !edit) throw new Error("Choose a catalog page first.");
      const raw = edit.retailPrice.replace(/[^0-9.]/g, "");
      const cents = raw ? Math.round(Number(raw) * 100) : null;
      return updateProduct({
        data: {
          productId: selectedId,
          name: edit.name,
          slug: edit.slug,
          categoryId: edit.categoryId,
          resortCodes: edit.resortCodes,
          brandText: edit.brandText,
          collectionText: edit.collectionText,
          description: edit.description,
          releaseType: edit.releaseType,
          releaseDate: edit.releaseDate,
          retailPriceCents: cents,
          retailPriceSource: edit.retailPriceSource,
          status: edit.status,
        },
      });
    },
    onSuccess: () => {
      toast.success("Catalog page updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const variantMutation = useMutation({
    mutationFn: (variantId: string | null) => {
      if (!selectedId) throw new Error("Choose a catalog page first.");
      if (variantId) {
        const draft = variantDrafts[variantId];
        if (!draft) throw new Error("That variation is no longer loaded.");
        return saveVariant({
          data: {
            productId: selectedId,
            variantId,
            label: draft.label,
            size: draft.size,
            color: draft.color,
            edition: draft.edition,
            position: draft.position === "" ? null : Number(draft.position),
            active: draft.active,
          },
        });
      }
      return saveVariant({
        data: {
          productId: selectedId,
          label: newVariant.label,
          size: newVariant.size,
          color: newVariant.color,
          edition: newVariant.edition,
          active: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Variation saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const imageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const draft = imageDrafts[imageId];
      if (!draft) throw new Error("That photo is no longer loaded.");
      if (!selectedId) throw new Error("Choose a catalog page first.");
      const storagePath = draft.file ? await uploadCatalogPhoto(selectedId, draft.file) : null;
      return updateImage({
        data: {
          imageId,
          alt: draft.alt,
          position: draft.position === "" ? null : Number(draft.position),
          viewRole: draft.viewRole,
          storagePath,
        },
      });
    },
    onSuccess: () => {
      toast.success("Photo details saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose a catalog page first.");
      if (!newPhoto.file) throw new Error("Choose a photo file to upload.");
      const storagePath = await uploadCatalogPhoto(selectedId, newPhoto.file);
      return addImage({
        data: {
          productId: selectedId,
          storagePath,
          alt: newPhoto.alt,
          viewRole: newPhoto.viewRole,
        },
      });
    },
    onSuccess: () => {
      toast.success("Photo added to this catalog page.");
      setNewPhoto({ alt: "", viewRole: "gallery", file: null });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (imageId: string) => deleteImage({ data: { imageId } }),
    onSuccess: () => {
      toast.success("Photo removed.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (console_.isLoading) {
    return (
      <p className="mx-auto max-w-[1080px] px-4 py-10 text-[13px] text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (!console_.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Administrator access required</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This console edits canonical catalog pages, so it is limited to ParkVault administrators.
        </p>
        <Link to="/browse" className="mt-4 inline-block text-[13px] underline underline-offset-2">
          Back to the catalog
        </Link>
      </div>
    );
  }

  const categories = console_.data.categories;
  const resorts = console_.data.resorts;

  return (
    <div className="mx-auto max-w-[1080px] space-y-4 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight">Edit a catalog page</h1>
        <p className="mt-1 max-w-[70ch] text-[12.5px] text-muted-foreground">
          Every field on an existing product page is editable here: naming and URL, category,
          resorts, release facts, observed retail price, publish status, variations and photo alt
          text. Each save writes an append-only audit entry. Nothing here creates market activity.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
          <Link to="/admin/catalog" className="underline underline-offset-2">
            Add a page or review listings
          </Link>
          <Link to="/admin" className="underline underline-offset-2">
            Pilot console
          </Link>
        </div>
      </header>

      <Panel title="Find a page" note="Search by product name or URL slug.">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
          }}
        >
          <div className="min-w-[240px] flex-1">
            <label className={labelClass} htmlFor="product-search">
              Search
            </label>
            <input
              id="product-search"
              className={fieldClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. spirit jersey"
            />
          </div>
          <button type="submit" className={buttonClass}>
            Search
          </button>
        </form>

        <div className="mt-3">
          {results.isLoading ? (
            <p className="text-[12.5px] text-muted-foreground">Loading catalog pages…</p>
          ) : (results.data ?? []).length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No catalog pages match that search.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(results.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      /{r.slug} · {r.status} · {r.variantCount} variation
                      {r.variantCount === 1 ? "" : "s"} · {r.imageCount} photo
                      {r.imageCount === 1 ? "" : "s"}
                      {r.isDemo ? " · demo" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-pressed={selectedId === r.id}
                    onClick={() => setSelectedId(r.id)}
                  >
                    {selectedId === r.id ? "Editing" : "Edit"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {!selectedId ? (
        <p className="text-[12.5px] text-muted-foreground">
          Choose a catalog page above to edit its details.
        </p>
      ) : detail.isLoading || !edit ? (
        <p className="text-[12.5px] text-muted-foreground">Loading page details…</p>
      ) : detail.isError ? (
        <p className="text-[12.5px] text-destructive">That catalog page could not be loaded.</p>
      ) : (
        <>
          <Panel title="Page details">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                productMutation.mutate();
              }}
            >
              <div>
                <label className={labelClass} htmlFor="p-name">
                  Product name
                </label>
                <input
                  id="p-name"
                  className={fieldClass}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-slug">
                  URL slug
                </label>
                <input
                  id="p-slug"
                  className={fieldClass}
                  value={edit.slug}
                  onChange={(e) => setEdit({ ...edit, slug: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-category">
                  Category
                </label>
                <select
                  id="p-category"
                  className={fieldClass}
                  value={edit.categoryId}
                  onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}
                >
                  <option value="">Choose a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="p-status">
                  Publish status
                </label>
                <select
                  id="p-status"
                  className={fieldClass}
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="p-brand">
                  Brand or maker (optional)
                </label>
                <input
                  id="p-brand"
                  className={fieldClass}
                  value={edit.brandText}
                  onChange={(e) => setEdit({ ...edit, brandText: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-collection">
                  Collection (optional)
                </label>
                <input
                  id="p-collection"
                  className={fieldClass}
                  value={edit.collectionText}
                  onChange={(e) => setEdit({ ...edit, collectionText: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-release-type">
                  Release type
                </label>
                <select
                  id="p-release-type"
                  className={fieldClass}
                  value={edit.releaseType}
                  onChange={(e) => setEdit({ ...edit, releaseType: e.target.value })}
                >
                  {releaseOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="p-release-date">
                  Release date (optional)
                </label>
                <input
                  id="p-release-date"
                  type="date"
                  className={fieldClass}
                  value={edit.releaseDate ?? ""}
                  onChange={(e) => setEdit({ ...edit, releaseDate: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-retail">
                  Observed retail price (USD, optional)
                </label>
                <input
                  id="p-retail"
                  className={fieldClass}
                  inputMode="decimal"
                  value={edit.retailPrice}
                  onChange={(e) => setEdit({ ...edit, retailPrice: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-retail-source">
                  Retail price source (optional)
                </label>
                <input
                  id="p-retail-source"
                  className={fieldClass}
                  value={edit.retailPriceSource}
                  onChange={(e) => setEdit({ ...edit, retailPriceSource: e.target.value })}
                  placeholder="Where the price was observed"
                />
              </div>

              <fieldset className="sm:col-span-2">
                <legend className={labelClass}>Sold at these resorts</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {resorts.map((r) => {
                    const checked = edit.resortCodes.includes(r.code);
                    return (
                      <label key={r.code} className="inline-flex items-center gap-2 text-[12.5px]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEdit({
                              ...edit,
                              resortCodes: checked
                                ? edit.resortCodes.filter((c) => c !== r.code)
                                : [...edit.resortCodes, r.code],
                            })
                          }
                        />
                        {r.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="p-description">
                  Description
                </label>
                <textarea
                  id="p-description"
                  className="min-h-[92px] w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <button type="submit" className={buttonClass} disabled={productMutation.isPending}>
                  {productMutation.isPending ? "Saving…" : "Save page details"}
                </button>
                <Link
                  to="/products/$slug"
                  params={{ slug: detail.data?.slug ?? "" }}
                  className="text-[12.5px] underline underline-offset-2"
                >
                  View the public page
                </Link>
              </div>
            </form>
          </Panel>

          <Panel
            title="Variations"
            note="Rename, reorder or retire a variation. Retiring keeps its market history and hides it from new activity."
          >
            <ul className="space-y-3">
              {(detail.data?.variants ?? []).map((v) => {
                const draft = variantDrafts[v.id];
                if (!draft) return null;
                return (
                  <li key={v.id} className="rounded-md border border-border p-3">
                    <div className="grid gap-2 sm:grid-cols-5">
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor={`v-label-${v.id}`}>
                          Label
                        </label>
                        <input
                          id={`v-label-${v.id}`}
                          className={fieldClass}
                          value={draft.label}
                          onChange={(e) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [v.id]: { ...draft, label: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor={`v-size-${v.id}`}>
                          Size
                        </label>
                        <input
                          id={`v-size-${v.id}`}
                          className={fieldClass}
                          value={draft.size}
                          onChange={(e) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [v.id]: { ...draft, size: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor={`v-color-${v.id}`}>
                          Colour
                        </label>
                        <input
                          id={`v-color-${v.id}`}
                          className={fieldClass}
                          value={draft.color}
                          onChange={(e) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [v.id]: { ...draft, color: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor={`v-position-${v.id}`}>
                          Order
                        </label>
                        <input
                          id={`v-position-${v.id}`}
                          className={fieldClass}
                          inputMode="numeric"
                          value={draft.position}
                          onChange={(e) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [v.id]: { ...draft, position: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-[12.5px]">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(e) =>
                            setVariantDrafts({
                              ...variantDrafts,
                              [v.id]: { ...draft, active: e.target.checked },
                            })
                          }
                        />
                        Available
                      </label>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={variantMutation.isPending}
                        onClick={() => variantMutation.mutate(v.id)}
                      >
                        Save variation
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 rounded-md border border-dashed border-border p-3">
              <p className="text-[12.5px] font-medium">Add a variation</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <div>
                  <label className={labelClass} htmlFor="nv-label">
                    Label
                  </label>
                  <input
                    id="nv-label"
                    className={fieldClass}
                    value={newVariant.label}
                    onChange={(e) => setNewVariant({ ...newVariant, label: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nv-size">
                    Size
                  </label>
                  <input
                    id="nv-size"
                    className={fieldClass}
                    value={newVariant.size}
                    onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nv-color">
                    Colour
                  </label>
                  <input
                    id="nv-color"
                    className={fieldClass}
                    value={newVariant.color}
                    onChange={(e) => setNewVariant({ ...newVariant, color: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nv-edition">
                    Edition
                  </label>
                  <input
                    id="nv-edition"
                    className={fieldClass}
                    value={newVariant.edition}
                    onChange={(e) => setNewVariant({ ...newVariant, edition: e.target.value })}
                  />
                </div>
              </div>
              <button
                type="button"
                className={`${buttonClass} mt-2`}
                disabled={variantMutation.isPending}
                onClick={() => variantMutation.mutate(null)}
              >
                Add variation
              </button>
            </div>
          </Panel>

          <Panel
            title="Photos"
            note="Upload owned photography, replace a file, edit alt text and ordering, or remove a photo. Only upload photography ParkVault owns the rights to."
          >
            <div className="rounded-md border border-border p-3">
              <p className="text-[12.5px] font-semibold">Add a photo</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="new-photo-file">
                    Photo file
                  </label>
                  <input
                    id="new-photo-file"
                    className={fieldClass}
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewPhoto({ ...newPhoto, file: e.target.files?.[0] ?? null })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-photo-role">
                    Role
                  </label>
                  <select
                    id="new-photo-role"
                    className={fieldClass}
                    value={newPhoto.viewRole}
                    onChange={(e) => setNewPhoto({ ...newPhoto, viewRole: e.target.value })}
                  >
                    <option value="gallery">Gallery</option>
                    <option value="spin">360 spin frame</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass} htmlFor="new-photo-alt">
                    Alt text
                  </label>
                  <input
                    id="new-photo-alt"
                    className={fieldClass}
                    value={newPhoto.alt}
                    onChange={(e) => setNewPhoto({ ...newPhoto, alt: e.target.value })}
                    placeholder="Front product view of this item"
                  />
                </div>
              </div>
              <button
                type="button"
                className={`${buttonClass} mt-2`}
                disabled={addPhotoMutation.isPending || !newPhoto.file}
                onClick={() => addPhotoMutation.mutate()}
              >
                {addPhotoMutation.isPending ? "Uploading…" : "Upload photo"}
              </button>
            </div>

            {(detail.data?.images ?? []).length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                No owned photography is attached to this page yet, so the public page shows an
                honest placeholder.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(detail.data?.images ?? []).map((i) => {
                  const draft = imageDrafts[i.id];
                  if (!draft) return null;
                  return (
                    <li key={i.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={i.storagePath}
                          alt={i.alt ?? "Attached catalog photo"}
                          className="size-16 shrink-0 border border-border bg-white object-contain p-1"
                          loading="lazy"
                        />
                        <p className="min-w-0 flex-1 break-all text-[12px] text-muted-foreground">
                          {i.storagePath}
                        </p>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-4">
                        <div className="sm:col-span-3">
                          <label className={labelClass} htmlFor={`i-alt-${i.id}`}>
                            Alt text
                          </label>
                          <input
                            id={`i-alt-${i.id}`}
                            className={fieldClass}
                            value={draft.alt}
                            onChange={(e) =>
                              setImageDrafts({
                                ...imageDrafts,
                                [i.id]: { ...draft, alt: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`i-position-${i.id}`}>
                            Order
                          </label>
                          <input
                            id={`i-position-${i.id}`}
                            className={fieldClass}
                            inputMode="numeric"
                            value={draft.position}
                            onChange={(e) =>
                              setImageDrafts({
                                ...imageDrafts,
                                [i.id]: { ...draft, position: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`i-role-${i.id}`}>
                            Role
                          </label>
                          <select
                            id={`i-role-${i.id}`}
                            className={fieldClass}
                            value={draft.viewRole}
                            onChange={(e) =>
                              setImageDrafts({
                                ...imageDrafts,
                                [i.id]: { ...draft, viewRole: e.target.value },
                              })
                            }
                          >
                            <option value="gallery">Gallery</option>
                            <option value="spin">360 spin frame</option>
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className={labelClass} htmlFor={`i-file-${i.id}`}>
                            Replace file (optional)
                          </label>
                          <input
                            id={`i-file-${i.id}`}
                            className={fieldClass}
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              setImageDrafts({
                                ...imageDrafts,
                                [i.id]: { ...draft, file: e.target.files?.[0] ?? null },
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={imageMutation.isPending}
                          onClick={() => imageMutation.mutate(i.id)}
                        >
                          {draft.file ? "Replace photo" : "Save photo details"}
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass} text-destructive`}
                          disabled={deletePhotoMutation.isPending}
                          onClick={() => deletePhotoMutation.mutate(i.id)}
                        >
                          Remove photo
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

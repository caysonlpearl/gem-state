import { useEffect, useState } from "react";
import { z } from "zod";
import { classifiedListingSchema } from "../../../src/lib/classified-listing-contracts";
import { fieldsForClassifiedItem } from "../../../src/config/classified-item-fields";
import { api, auth, type Bootstrap } from "./client";
import { uploadPhoto } from "./photos";

const title = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodEffects
    ? unwrap(schema._def.schema)
    : schema instanceof z.ZodOptional ||
        schema instanceof z.ZodNullable ||
        schema instanceof z.ZodDefault
      ? unwrap(schema._def.innerType)
      : schema;
}
function ObjectFields({
  schema,
  value,
  set,
}: {
  schema: z.ZodObject<z.ZodRawShape>;
  value: Record<string, unknown>;
  set: (v: Record<string, unknown>) => void;
}) {
  return (
    <div className="fields">
      {Object.entries(schema.shape).map(([key, raw]) => {
        const original = raw as z.ZodTypeAny,
          field = unwrap(original),
          required = !original.isOptional();
        const update = (next: unknown) => set({ ...value, [key]: next });
        if (field instanceof z.ZodBoolean)
          return (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={value[key] === true}
                onChange={(e) => update(e.target.checked)}
              />
              {title(key)}
            </label>
          );
        if (field instanceof z.ZodEnum)
          return (
            <label key={key}>
              {title(key)}
              <select
                required={required}
                value={String(value[key] ?? "")}
                onChange={(e) => update(e.target.value || undefined)}
              >
                <option value="">Choose {title(key).toLowerCase()}</option>
                {field.options.map((o: string) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        if (
          field instanceof z.ZodString ||
          field instanceof z.ZodNumber ||
          field instanceof z.ZodArray ||
          field instanceof z.ZodEffects
        )
          return (
            <label key={key}>
              {title(key)}
              {!required && <small> Optional</small>}
              <input
                required={required}
                type={field instanceof z.ZodNumber ? "number" : "text"}
                step="any"
                value={
                  Array.isArray(value[key])
                    ? (value[key] as string[]).join(", ")
                    : String(value[key] ?? "")
                }
                onChange={(e) =>
                  update(
                    e.target.value === ""
                      ? undefined
                      : field instanceof z.ZodNumber
                        ? Number(e.target.value)
                        : field instanceof z.ZodArray
                          ? e.target.value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean)
                          : e.target.value,
                  )
                }
              />
            </label>
          );
        return null;
      })}
    </div>
  );
}
export function Post({
  bootstrap,
  onPublished,
  ownerId,
}: {
  bootstrap: Bootstrap;
  ownerId: string;
  onPublished: (id: string) => void;
}) {
  const [restored] = useState<{
    category?: string;
    details?: Record<string, unknown>;
    items?: Record<string, string>;
    price?: string;
  }>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`bb-draft-${ownerId}`) ?? "{}");
    } catch {
      return {};
    }
  });
  const [category, setCategory] = useState(String(restored.category ?? "general"));
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    try {
      const saved = sessionStorage.getItem(`bb-draft-${ownerId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.draft ?? parsed;
      }
    } catch {
      /* optional draft storage */
    }
    return {
      title: "",
      description: "",
      condition: "used_good",
      state: "ID",
      region: "Treasure Valley",
      city: "",
      fulfillmentMode: "local_pickup",
    };
  });
  const [details, setDetails] = useState<Record<string, unknown>>(restored.details ?? {});
  const [items, setItems] = useState<Record<string, string>>(restored.items ?? {});
  const [price, setPrice] = useState(String(restored.price ?? ""));
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [seller, setSeller] = useState<{
    exists: boolean;
    displayName: string;
    slug: string;
  } | null>(null);
  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [sellerTerms, setSellerTerms] = useState(false);
  useEffect(() => {
    api<{ exists: boolean; displayName: string; slug: string }>("seller")
      .then((s) => {
        setSeller(s);
        setName(s.displayName);
        setSlug(s.slug);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `bb-draft-${ownerId}`,
        JSON.stringify({ draft, category, details, items, price }),
      );
    } catch {
      /* optional */
    }
  }, [draft, category, details, items, price, ownerId]);
  const specialized =
    bootstrap.categories.find((c) => c.slug === category)?.group === "motors"
      ? "vehicle"
      : category === "other-real-estate"
        ? "home"
        : category === "jobs"
          ? "job"
          : category === "services"
            ? "service"
            : category === "pets"
              ? "pet"
              : null;
  const baseShape = (unwrap(classifiedListingSchema) as z.ZodObject<z.ZodRawShape>).shape;
  const specialSchema = specialized
    ? (unwrap(baseShape[specialized]) as z.ZodObject<z.ZodRawShape>)
    : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await auth.auth.getUser();
      if (!data.user) throw Error("Please sign in first.");
      if (!seller?.exists) {
        if (!sellerTerms) throw Error("Accept the seller and photo-display terms first.");
        await api("seller", "POST", {
          displayName: name,
          slug,
          acceptTerms: true,
          bio: "",
          shipFromName: "",
          shipFromPhone: "",
          shipFromLine1: "",
          shipFromCity: "",
          shipFromRegion: "",
          shipFromPostalCode: "",
          defaultShippingMethod: "",
          defaultHandlingDays: 0,
        });
        setSeller({ exists: true, displayName: name, slug });
      }
      const parsed = classifiedListingSchema.safeParse({
        ...draft,
        category,
        priceCents: Math.round(Number(price) * 100),
        itemDetails: items,
        ...(specialized ? { [specialized]: details } : {}),
      });
      if (!parsed.success)
        throw Error(
          parsed.error.issues
            .map((i) => `${title(i.path.join(" "))}: ${i.message}`)
            .slice(0, 3)
            .join(" · "),
        );
      if (!files.length) throw Error("Add at least one exact-item photo.");
      const paths: string[] = [];
      for (const file of files) paths.push(await uploadPhoto(file, data.user.id));
      const result = await api<{ listingId: string }>("listings", "POST", {
        ...parsed.data,
        publicMediaPaths: paths,
        evidencePaths: paths,
      });
      sessionStorage.removeItem(`bb-draft-${ownerId}`);
      onPublished(result.listingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your listing could not be posted. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack">
      <h1>Post a listing</h1>
      <p>Use your own photos and accurate details. Buyers and sellers arrange payment directly.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {seller && !seller.exists && (
        <fieldset>
          <legend>Your seller profile</legend>
          <label>
            Public name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Seller username
            <input
              required
              value={slug}
              pattern="[a-z0-9-]+"
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={sellerTerms}
              onChange={(e) => setSellerTerms(e.target.checked)}
            />
            I accept the seller and photo-display terms.
          </label>
        </fieldset>
      )}
      <label>
        Category
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setDetails({});
            setItems({});
          }}
        >
          {bootstrap.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input
          required
          minLength={3}
          maxLength={120}
          value={String(draft.title ?? "")}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          required
          minLength={20}
          maxLength={5000}
          value={String(draft.description ?? "")}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <label>
        Price in dollars
        <input
          required
          type="number"
          min={category === "pets" || category === "services" ? 0 : 0.01}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <ObjectFields
        schema={z.object({
          condition: baseShape.condition,
          state: baseShape.state,
          region: baseShape.region,
          city: baseShape.city,
          postalCode: baseShape.postalCode,
          fulfillmentMode: baseShape.fulfillmentMode,
        })}
        value={draft}
        set={setDraft}
      />
      {specialSchema && (
        <fieldset>
          <legend>{title(specialized!)} details</legend>
          <ObjectFields schema={specialSchema} value={details} set={setDetails} />
        </fieldset>
      )}
      {!specialized &&
        fieldsForClassifiedItem(category).map((f) => (
          <label key={f.key}>
            {f.label}
            {f.options ? (
              <select
                required={f.required}
                value={items[f.key] ?? ""}
                onChange={(e) => setItems({ ...items, [f.key]: e.target.value })}
              >
                <option value="">Choose</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                required={f.required}
                value={items[f.key] ?? ""}
                onChange={(e) => setItems({ ...items, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
      <label>
        Photos
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 8))}
        />
        <small>{files.length} selected · up to 8 photos</small>
      </label>
      <button className="primary" disabled={busy || seller === null}>
        {busy ? "Uploading and posting…" : "Post listing"}
      </button>
    </form>
  );
}

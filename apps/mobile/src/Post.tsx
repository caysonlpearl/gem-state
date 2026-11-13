import { useMemo, useRef, useState, useEffect } from "react";
import { api, auth, type Bootstrap } from "./client";
import { installIdentifier } from "./identity";
import { uploadPhoto } from "./photos";
import { SellerSetupView } from "../../../src/components/seller/SellerSetupView";
import { ListingFormView } from "../../../src/components/classifieds/listing-form/ListingFormView";
import { useListingFormState } from "../../../src/components/classifieds/listing-form/useListingFormState";
import {
  initialListingForm,
  type ListingFormState,
} from "../../../src/components/classifieds/listing-form/types";
import { listingFormSubmission } from "../../../src/components/classifieds/listing-form/submission";
import {
  fromEditor,
  kindForCategory,
} from "../../../src/components/classifieds/listing-form/payload";
import { VehicleVinLookupView } from "../../../src/components/classifieds/listing-form/VehicleVinLookupView";
import { applyDecodedVin } from "../../../src/components/classifieds/listing-form/vin-fields";
import { classifiedListingSchema } from "../../../src/lib/classified-listing-contracts";
import { mobileCategoryAllowed, mobileListingAllowed } from "../../../src/lib/mobile-contract";
import type { SellerSetup } from "../../../src/lib/seller.functions";
import type {
  ClassifiedListingEditor,
  CreateClassifiedListingInput,
} from "../../../src/lib/classifieds.functions";
import type { VehicleDecodeResult } from "../../../src/lib/vehicle.functions";
import {
  readPostingAttempt,
  storePostingAttempt,
  clearPostingAttempt,
  submitPostingAttempt,
  postingDefinitelyRejected,
  type PostingAttempt,
} from "./posting-attempts";
import { CreateListingHeader } from "../../../src/components/seller/CreateListingHeader";

const text = (error: unknown) =>
  error instanceof Error ? error.message : "Bluebird could not complete this request.";
export function Post({
  bootstrap,
  ownerId,
  onSubmitted,
}: {
  bootstrap: Bootstrap;
  ownerId: string;
  onSubmitted: (id: string) => void;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [seller, setSeller] = useState<SellerSetup | null>(null),
    [error, setError] = useState(""),
    [showSetup, setShowSetup] = useState(false);
  const [submitted, setSubmitted] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<SellerSetup>("seller", "GET", undefined, controller.signal, actor)
      .then(setSeller)
      .catch((e) => {
        if (!controller.signal.aborted) setError(text(e));
      });
    return () => controller.abort();
  }, [actor]);
  if (error && !seller)
    return (
      <p role="alert" className="m-5 text-sm text-destructive">
        {error}
      </p>
    );
  if (!seller)
    return (
      <p role="status" className="m-5 text-sm text-muted-foreground">
        Loading seller setup…
      </p>
    );
  if (!seller.exists || !seller.termsAccepted || showSetup)
    return (
      <NativeSellerSetup
        setup={seller}
        ownerId={ownerId}
        onSaved={(value) => {
          setSeller(value);
          setShowSetup(true);
        }}
        onStart={() => {
          setShowSetup(false);
          setSubmitted(false);
        }}
      />
    );
  if (submitted)
    return (
      <section className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
        <CreateListingHeader showPromotions={false} />
        <div role="status" className="mt-8 border border-border bg-card p-6">
          <p className="text-[15px] font-semibold">Listing submitted for Bluebird review.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your listing will be reviewed before going live. Buyers will see your title,
            description, photos, price, location, and published details.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="h-11 bg-primary px-4 text-sm text-primary-foreground"
            onClick={() => {
              setSubmitted(false);
              setVersion((n) => n + 1);
            }}
          >
            Create a listing
          </button>
          <button
            type="button"
            className="h-11 border border-input px-4 text-sm"
            onClick={() => setShowSetup(true)}
          >
            Seller profile
          </button>
        </div>
      </section>
    );
  return (
    <NativeListingEditor
      key={`${ownerId}:${version}`}
      ownerId={ownerId}
      bootstrap={bootstrap}
      onProfile={() => setShowSetup(true)}
      onSubmitted={(id) => {
        setSubmitted(true);
        onSubmitted(id);
      }}
    />
  );
}
function NativeSellerSetup({
  setup,
  ownerId,
  onSaved,
  onStart,
}: {
  setup: SellerSetup;
  ownerId: string;
  onSaved: (setup: SellerSetup) => void;
  onStart: () => void;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(
    () =>
      ({
        ...setup,
        defaultHandlingDays: String(setup.defaultHandlingDays ?? ""),
        acceptTerms: setup.termsAccepted,
      }) as unknown as Record<string, string | boolean>,
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!draft.acceptTerms) throw Error("Accept the seller and photo-display terms.");
      let avatarUrl = String(draft.avatarUrl ?? "");
      if (avatarFile) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(avatarFile.type) ||
          avatarFile.size > 5 * 1024 * 1024 ||
          !avatarFile.size
        )
          throw Error("Use a JPG, PNG or WebP no larger than 5 MB.");
        const session = (await auth.auth.getSession()).data.session;
        if (session?.user.id !== ownerId || actor.installId !== installIdentifier())
          throw Error("Your account changed. Please try again.");
        const extension =
            avatarFile.type === "image/jpeg"
              ? "jpg"
              : avatarFile.type === "image/png"
                ? "png"
                : "webp",
          path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
        const uploaded = await auth.storage
          .from("seller-avatars")
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
        if (uploaded.error) throw Error(`Profile photo upload failed: ${uploaded.error.message}`);
        avatarUrl = auth.storage.from("seller-avatars").getPublicUrl(path).data.publicUrl;
      }
      await api(
        "seller",
        "POST",
        {
          ...draft,
          avatarUrl,
          defaultHandlingDays: Number(draft.defaultHandlingDays ?? 0),
          acceptTerms: true,
        },
        undefined,
        actor,
      );
      const fresh = await api<SellerSetup>("seller", "GET", undefined, undefined, actor);
      onSaved(fresh);
      setAvatarFile(null);
      setNotice("Seller profile saved. You can now create listings.");
    } catch (e) {
      setError(text(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const ready = setup.exists && setup.termsAccepted;
  return (
    <SellerSetupView
      as="section"
      draft={draft}
      avatarFile={avatarFile}
      setAvatarFile={setAvatarFile}
      set={(key, value) => setDraft((prior) => ({ ...prior, [key]: value }))}
      saveMutation={{ isPending: busy, mutate: () => void save() }}
      exists={setup.exists}
      profileReady={ready}
      sellerReady={ready}
      error={error}
      notice={notice}
      renderStartLink={({ className, children }) => (
        <a
          href="#/post"
          aria-disabled={!ready}
          className={className}
          onClick={(e) => {
            e.preventDefault();
            if (ready) onStart();
          }}
        >
          {children}
        </a>
      )}
    />
  );
}
function restoreDraft(ownerId: string): ListingFormState {
  try {
    const stored = JSON.parse(sessionStorage.getItem(`bb-draft-listing-${ownerId}`) ?? "null");
    if (stored?.form) {
      const form = { ...initialListingForm };
      for (const key of Object.keys(initialListingForm) as (keyof ListingFormState)[])
        if (key !== "itemDetails" && typeof stored.form[key] === "string")
          Object.assign(form, { [key]: stored.form[key] });
      if (
        stored.form.itemDetails &&
        typeof stored.form.itemDetails === "object" &&
        !Array.isArray(stored.form.itemDetails)
      )
        form.itemDetails = Object.fromEntries(
          Object.entries(stored.form.itemDetails).filter(([, value]) => typeof value === "string"),
        ) as Record<string, string>;
      if (!mobileCategoryAllowed(form.category)) form.category = "";
      return form;
    }
    const old = JSON.parse(sessionStorage.getItem(`bb-draft-${ownerId}`) ?? "null");
    if (old) {
      const base = {
        ...initialListingForm,
        ...old.draft,
        category: old.category ?? "general",
        price: old.price ?? "",
        itemDetails: old.items ?? {},
      };
      const kind = kindForCategory(base.category);
      const migrated = fromEditor({
        ...base,
        priceCents: Number(base.price) * 100,
        sellerNote: base.sellerNote ?? "",
        postalCode: base.postalCode ?? "",
        parcelLengthIn: base.length ?? "",
        parcelWidthIn: base.width ?? "",
        parcelHeightIn: base.height ?? "",
        parcelWeightLb: base.weight ?? "",
        ...(kind !== "item" ? { [kind]: old.details } : {}),
        imageUrls: [],
      } as unknown as ClassifiedListingEditor);
      const safe = { ...initialListingForm, itemDetails: {} };
      for (const key of Object.keys(initialListingForm) as (keyof ListingFormState)[])
        if (key !== "itemDetails" && typeof migrated[key] === "string")
          Object.assign(safe, { [key]: migrated[key] });
      if (
        migrated.itemDetails &&
        typeof migrated.itemDetails === "object" &&
        !Array.isArray(migrated.itemDetails)
      )
        safe.itemDetails = Object.fromEntries(
          Object.entries(migrated.itemDetails).filter(([, value]) => typeof value === "string"),
        );
      if (!mobileCategoryAllowed(safe.category)) safe.category = "";
      return safe;
    }
  } catch {
    /* A corrupt/blocked draft must not prevent posting. */
  }
  return { ...initialListingForm, itemDetails: {} };
}
function NativeListingEditor({
  ownerId,
  bootstrap,
  onProfile,
  onSubmitted,
}: {
  ownerId: string;
  bootstrap: Bootstrap;
  onProfile: () => void;
  onSubmitted: (id: string) => void;
}) {
  const [initialAttempt] = useState(() => readPostingAttempt(ownerId));
  const [restored] = useState(() => {
    if (!initialAttempt) return restoreDraft(ownerId);
    const payload = initialAttempt.payload;
    return fromEditor({
      ...payload,
      sellerNote: payload.sellerNote ?? "",
      postalCode: payload.postalCode ?? "",
      parcelLengthIn: String(payload.parcelLengthIn ?? ""),
      parcelWidthIn: String(payload.parcelWidthIn ?? ""),
      parcelHeightIn: String(payload.parcelHeightIn ?? ""),
      parcelWeightLb: String(payload.parcelWeightLb ?? ""),
      imageUrls: [],
    } as unknown as ClassifiedListingEditor);
  });
  const state = useListingFormState({
    mode: "create",
    initialDraft: restored,
    onDraftChange: (form) => {
      try {
        sessionStorage.setItem(`bb-draft-listing-${ownerId}`, JSON.stringify({ form }));
      } catch {
        /* Optional storage. */
      }
    },
  });
  const [pending, setPending] = useState<PostingAttempt | null>(initialAttempt);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const uploaded = useRef(new WeakMap<File, string>());
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let attempt = pending;
    try {
      if (!bootstrap.features.durablePosting)
        throw Error("Posting is temporarily unavailable. Your draft is still here.");
      if (!attempt) {
        const raw = listingFormSubmission(state.form);
        if (
          !mobileListingAllowed({
            categorySlug: raw.category,
            title: raw.title,
            description: raw.description,
          })
        )
          throw Error("This listing is not supported in the app.");
        const validation = classifiedListingSchema.safeParse(raw);
        if (!validation.success)
          throw Error(
            validation.error.issues
              .slice(0, 3)
              .map((issue) => issue.message)
              .join(" · "),
          );
        if (!state.files.length) throw Error("Add at least one listing photo.");
        if (!state.photoRights) throw Error("Confirm that you can publish these photos.");
        const paths: string[] = [];
        for (const file of state.files) {
          let path = uploaded.current.get(file);
          if (!path) {
            path = await uploadPhoto(file, ownerId);
            uploaded.current.set(file, path);
          }
          paths.push(path);
        }
        attempt = {
          requestId: crypto.randomUUID(),
          payload: {
            ...raw,
            ...validation.data,
            publicMediaPaths: paths,
            evidencePaths: paths,
          } as CreateClassifiedListingInput,
        };
        storePostingAttempt(ownerId, attempt);
        setPending(attempt);
      }
      const result = await submitPostingAttempt(ownerId, attempt);
      clearPostingAttempt(ownerId);
      for (const key of [`bb-draft-listing-${ownerId}`, `bb-draft-${ownerId}`])
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* Optional storage. */
        }
      onSubmitted(result.listingId);
    } catch (e) {
      // A rejection of a retry cannot prove that the earlier request failed.
      // Keep its receipt through expired sessions or changed permissions.
      if (attempt && !pending && postingDefinitelyRejected(e)) {
        clearPostingAttempt(ownerId);
        setPending(null);
      }
      setError(text(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <button
        type="button"
        onClick={onProfile}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Seller profile
      </button>
      <CreateListingHeader showPromotions={false} />
      {pending && (
        <p role="status" className="mt-5 border border-border bg-secondary/50 p-4 text-sm">
          Retry your submission to confirm the result before starting another listing. Your original
          details and photos are preserved.
        </p>
      )}
      <ListingFormView
        props={{ mode: "create" }}
        state={state}
        categories={bootstrap.categories
          .filter((c) => mobileCategoryAllowed(c.slug))
          .map((c) => ({ ...c, id: c.slug }))}
        mutation={{ isPending: busy, mutate: () => void submit() }}
        locked={Boolean(pending) || busy}
        retainedPhotoCount={pending?.payload.publicMediaPaths.length ?? 0}
        submitLabel={pending ? "Retry submission" : undefined}
        vinLookup={<NativeVinLookup form={state.form} set={state.set} ownerId={ownerId} />}
        error={error}
      />
    </section>
  );
}
function NativeVinLookup({
  form,
  set,
  ownerId,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
  ownerId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function decode() {
    if (busy) return;
    setError("");
    setNotice("");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(form.vin)) {
      setError("Enter a valid 17-character VIN. VINs do not use I, O, or Q.");
      return;
    }
    setBusy(true);
    try {
      const value = await api<VehicleDecodeResult>(
        "vehicles/vin",
        "POST",
        { vin: form.vin },
        undefined,
        { userId: ownerId, installId: installIdentifier() },
      );
      applyDecodedVin(value, set);
      setNotice("Vehicle details filled from the VIN. Review and edit them before continuing.");
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <VehicleVinLookupView
      form={form}
      set={set}
      isPending={busy}
      decode={() => void decode()}
      error={error}
      notice={notice}
    />
  );
}

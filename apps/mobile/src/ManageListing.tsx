import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Bootstrap } from "./client";
import { installIdentifier } from "./identity";
import { uploadPhoto } from "./photos";
import { Post, NativeVinLookup } from "./Post";
import { ListingFormView } from "../../../src/components/classifieds/listing-form/ListingFormView";
import { useListingFormState } from "../../../src/components/classifieds/listing-form/useListingFormState";
import { listingFormSubmission } from "../../../src/components/classifieds/listing-form/submission";
import { fromEditor } from "../../../src/components/classifieds/listing-form/payload";
import { classifiedListingSchema } from "../../../src/lib/classified-listing-contracts";
import { mobileCategoryAllowed, mobileListingAllowed } from "../../../src/lib/mobile-contract";
import type { ClassifiedListingEditor } from "../../../src/lib/classifieds.functions";
import type { ListingFormState } from "../../../src/components/classifieds/listing-form/types";
import {
  readListingAttempt,
  storeListingAttempt,
  clearListingAttempt,
  submitListingAttempt,
  listingChanged,
  listingDefinitelyRejected,
  type ListingAttempt,
} from "./listing-management-attempts";
type Snapshot = { ownerId: string; version: string; editor: ClassifiedListingEditor };
const text = (e: unknown) =>
  e instanceof Error ? e.message : "Your listing could not be updated. Please retry.";
const draftKey = (owner: string, id: string) => `bb-draft-edit-${owner}-${id}`;
export function NativeManageListing({
  ownerId,
  listingId,
  mode,
  bootstrap,
  onNavigate,
  onChanged,
}: {
  ownerId: string;
  listingId: string;
  mode: "edit" | "duplicate";
  bootstrap: Bootstrap;
  onNavigate: (path: string) => void;
  onChanged: () => void;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (!bootstrap.features.listingManagement) return;
    const c = new AbortController();
    setError("");
    setData(null);
    api<Snapshot>(
      `account/listings/${listingId}/editor`,
      "GET",
      undefined,
      AbortSignal.any([c.signal, AbortSignal.timeout(20000)]),
      actor,
    )
      .then((r) => {
        if (c.signal.aborted || actor.installId !== installIdentifier()) return;
        if (r.ownerId !== ownerId || r.editor.id !== listingId || !/^[0-9a-f]{64}$/.test(r.version))
          throw Error("Your listing could not be confirmed. Please retry.");
        setData(r);
      })
      .catch((e) => {
        if (!c.signal.aborted && actor.installId === installIdentifier()) setError(text(e));
      });
    return () => c.abort();
  }, [actor, ownerId, listingId, reload, bootstrap.features.listingManagement]);
  if (!bootstrap.features.listingManagement)
    return (
      <p role="alert" className="m-5 text-sm">
        Listing changes are temporarily unavailable. Your draft is still here.
      </p>
    );
  if (!data)
    return (
      <p role={error ? "alert" : "status"} className="m-5 text-sm">
        {error || "Loading your listing…"}
        {error && (
          <button
            type="button"
            className="ml-2 min-h-11 underline"
            onClick={() => setReload((n) => n + 1)}
          >
            Retry listing
          </button>
        )}
      </p>
    );
  if (mode === "duplicate")
    return (
      <Post
        key={listingId}
        ownerId={ownerId}
        bootstrap={bootstrap}
        duplicateFrom={data.editor}
        onSubmitted={onChanged}
      />
    );
  return (
    <EditListing
      key={`${listingId}:${reload}`}
      ownerId={ownerId}
      data={data}
      bootstrap={bootstrap}
      onNavigate={onNavigate}
      onChanged={onChanged}
      onReload={() => {
        setData(null);
        setReload((n) => n + 1);
      }}
    />
  );
}
function EditListing({
  ownerId,
  data,
  bootstrap,
  onNavigate,
  onChanged,
  onReload,
}: {
  ownerId: string;
  data: Snapshot;
  bootstrap: Bootstrap;
  onNavigate: (path: string) => void;
  onChanged: () => void;
  onReload: () => void;
}) {
  const [prior] = useState(() => readListingAttempt(ownerId)),
    [pending, setPending] = useState<ListingAttempt | null>(prior);
  const same = pending?.listingId === data.editor.id && pending.action === "edit";
  const [draft] = useState<{ form: ListingFormState; version: string } | null>(() => {
    try {
      if (same && pending)
        return {
          version: pending.version,
          form: fromEditor({
            ...data.editor,
            ...pending.input,
            parcelLengthIn: String(pending.input.parcelLengthIn ?? ""),
            parcelWidthIn: String(pending.input.parcelWidthIn ?? ""),
            parcelHeightIn: String(pending.input.parcelHeightIn ?? ""),
            parcelWeightLb: String(pending.input.parcelWeightLb ?? ""),
          } as ClassifiedListingEditor),
        };
      const stored = JSON.parse(
        sessionStorage.getItem(draftKey(ownerId, data.editor.id)) ?? "null",
      );
      if (
        stored &&
        /^[0-9a-f]{64}$/.test(stored.version) &&
        stored.form &&
        typeof stored.form === "object" &&
        mobileCategoryAllowed(stored.form.category) &&
        Object.entries(stored.form).every(([key, v]) =>
          key === "itemDetails"
            ? v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              Object.values(v).every((n) => typeof n === "string")
            : typeof v === "string",
        )
      )
        return { version: stored.version, form: { ...fromEditor(data.editor), ...stored.form } };
    } catch {
      /* Optional draft. */
    }
    return null;
  });
  const baseVersion = draft?.version ?? data.version;
  const props = {
    mode: "edit" as const,
    listingId: data.editor.id,
    initial: data.editor,
    status: same ? "active" : data.editor.status,
  };
  const state = useListingFormState({
    ...props,
    initialDraft: draft?.form,
    onDraftChange: (form) => {
      try {
        sessionStorage.setItem(
          draftKey(ownerId, data.editor.id),
          JSON.stringify({ form, version: baseVersion }),
        );
      } catch {
        /* In-memory form remains. */
      }
    },
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    uploads = useRef(new WeakMap<File, string>()),
    install = useRef(installIdentifier());
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const current = () => live.current && install.current === installIdentifier();
  async function submit() {
    if (lock.current || (pending && !same) || conflict) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let attempt = pending;
    try {
      if (!bootstrap.features.listingManagement)
        throw Error("Listing changes are temporarily unavailable. Your draft is still here.");
      if (!attempt) {
        const raw = listingFormSubmission(state.form),
          valid = classifiedListingSchema.safeParse(raw);
        if (!valid.success)
          throw Error(
            valid.error.issues
              .slice(0, 3)
              .map((i) => i.message)
              .join(" · "),
          );
        if (
          !mobileListingAllowed({
            categorySlug: raw.category,
            title: raw.title,
            description: raw.description,
          })
        )
          throw Error("This listing is not supported in the app.");
        if (state.files.length && !state.photoRights)
          throw Error("Confirm that you can publish these photos.");
        const paths: string[] = [];
        for (const file of state.files) {
          let path = uploads.current.get(file);
          if (!path) {
            path = await uploadPhoto(file, ownerId);
            uploads.current.set(file, path);
          }
          if (!current()) return;
          paths.push(path);
        }
        attempt = {
          requestId: crypto.randomUUID(),
          listingId: data.editor.id,
          action: "edit",
          version: baseVersion,
          input: { ...raw, ...valid.data, publicMediaPaths: paths },
        };
        storeListingAttempt(ownerId, attempt);
        setPending(attempt);
      }
      await submitListingAttempt(ownerId, attempt);
      clearListingAttempt(ownerId);
      try {
        sessionStorage.removeItem(draftKey(ownerId, data.editor.id));
      } catch {
        /* Optional storage. */
      }
      if (!current()) return;
      setPending(null);
      setSaved(true);
      onChanged();
    } catch (e) {
      if (!current()) return;
      if (attempt && (listingChanged(e) || (!pending && listingDefinitelyRejected(e)))) {
        clearListingAttempt(ownerId);
        setPending(null);
      }
      if (listingChanged(e)) setConflict(true);
      setError(text(e));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  if (saved)
    return (
      <section className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
        <h1 className="font-editorial text-[40px] tracking-[-0.04em]">Listing updated</h1>
        <p role="status" className="mt-4 text-sm">
          Your listing was submitted for Bluebird review. Its current status is available in Your
          listings.
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 font-semibold underline"
          onClick={() => onNavigate("/account/listings")}
        >
          Your listings
        </button>
      </section>
    );
  return (
    <section className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <button
        type="button"
        className="min-h-11 text-[12px] text-muted-foreground underline"
        onClick={() => onNavigate("/account/listings")}
      >
        Your listings
      </button>
      <h1 className="mt-5 font-editorial text-[40px] tracking-[-0.04em]">Edit listing</h1>
      {pending && (
        <p role="status" className="mt-4 border border-border p-4 text-sm">
          {same
            ? "Retry your previous submission to confirm the result. Your original details and photos are preserved."
            : "Confirm your previous listing change in Your listings before editing another item."}
        </p>
      )}
      {data.editor.status !== "active" && !same && (
        <p role="status" className="mt-4 text-sm">
          Only open listings can be edited.
        </p>
      )}
      {conflict && (
        <button
          type="button"
          className="mt-4 min-h-11 underline"
          onClick={() => {
            if (
              window.confirm(
                "Reload the latest listing? This replaces your saved draft with the current listing details.",
              )
            ) {
              try {
                sessionStorage.removeItem(draftKey(ownerId, data.editor.id));
              } catch {
                /* Optional storage. */
              }
              onReload();
            }
          }}
        >
          Reload latest listing
        </button>
      )}
      <ListingFormView
        props={props}
        state={state}
        categories={bootstrap.categories
          .filter((c) => mobileCategoryAllowed(c.slug))
          .map((c) => ({ ...c, id: c.slug }))}
        mutation={{
          isPending: busy || Boolean(pending && !same) || conflict,
          mutate: () => void submit(),
        }}
        locked={busy || Boolean(pending) || conflict}
        retainedPhotoCount={
          same ? ((pending?.input.publicMediaPaths as string[] | undefined)?.length ?? 0) : 0
        }
        submitLabel={same ? "Retry submission" : undefined}
        error={error}
        vinLookup={<NativeVinLookup form={state.form} set={state.set} ownerId={ownerId} />}
      />
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { findIdahoPlace } from "@/config/idaho-places";
import { isMotorsCategory } from "@/lib/classifieds-display";
import {
  fromEditor,
  kindForCategory,
  isHomeCategory,
  isJobCategory,
  isServiceCategory,
  isPetCategory,
  type ListingKind,
} from "./payload";
import { initialListingForm, type ListingFormState } from "./types";
import type { ListingFormProps } from "./props";
import { motorsCategorySlugs, itemCategorySlugs, listingTypeCopy } from "./model";

/** Shared website form state, previews, category rules and city validation. */
export function useListingFormState(
  props: ListingFormProps & {
    initialDraft?: ListingFormState;
    onDraftChange?: (form: ListingFormState) => void;
  },
) {
  const [form, setForm] = useState<ListingFormState>(() => {
    if (props.mode === "edit") return fromEditor(props.initial);
    return (
      props.initialDraft ??
      (props.duplicateFrom ? fromEditor(props.duplicateFrom) : initialListingForm)
    );
  });
  const [files, setFiles] = useState<File[]>([]);
  const [photoRights, setPhotoRights] = useState(false);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [kind, setKind] = useState<ListingKind>(() => kindForCategory(form.category));

  const filePreviews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => {
    return () => {
      filePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

  function reorderFiles(from: number, to: number) {
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  useEffect(() => {
    if (props.mode === "edit") {
      setForm(fromEditor(props.initial));
      setKind(kindForCategory(props.initial.category));
    }
    // Only re-hydrate when switching to a different listing, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode === "edit" ? props.listingId : null]);

  const set = (key: keyof ListingFormState, value: string | Record<string, string>) =>
    setForm((current) => ({ ...current, [key]: value }) as ListingFormState);

  // Idaho sellers pick their city from the full list of Idaho places; the
  // region follows from it. Other states keep free-text city and area.
  const isIdaho = form.state === "ID";
  const unknownIdahoCity = isIdaho && form.city.trim().length >= 2 && !findIdahoPlace(form.city);
  const cityInput = useRef<HTMLInputElement>(null);
  const [cityLeft, setCityLeft] = useState(false);
  useEffect(() => {
    cityInput.current?.setCustomValidity(
      unknownIdahoCity ? "Pick your city from the list of Idaho cities and towns." : "",
    );
  }, [unknownIdahoCity]);
  function setCity(city: string) {
    setForm((current) => {
      const place = current.state === "ID" ? findIdahoPlace(city) : undefined;
      return { ...current, city, ...(place ? { region: place[1] } : {}) };
    });
  }

  function selectKind(next: ListingKind) {
    setKind(next);
    if (next === "home") set("category", "other-real-estate");
    else if (next === "job") set("category", "jobs");
    else if (next === "service") set("category", "services");
    else if (next === "pet") set("category", "pets");
    else if (next === "vehicle" && !motorsCategorySlugs.has(form.category)) set("category", "");
    else if (next === "item" && !itemCategorySlugs.has(form.category)) set("category", "");
  }

  // Keep the selected tab authoritative while a user is choosing its category.
  // This lets the form become category-specific immediately instead of briefly
  // showing the generic item form after switching to Vehicle or Pet.
  const isVehicle = kind === "vehicle" || isMotorsCategory(form.category);
  const isHome = kind === "home" || isHomeCategory(form.category);
  const isJob = kind === "job" || isJobCategory(form.category);
  const isService = kind === "service" || isServiceCategory(form.category);
  const isPet = kind === "pet" || isPetCategory(form.category);
  const hasSpecialDetails = isVehicle || isHome || isJob || isService || isPet;
  const formCopy = listingTypeCopy[kind];
  // Animals, homes, jobs and services have no item condition.
  const hidesCondition = isHome || isJob || isService || isPet;
  const hidesFulfillment = isHome || isJob || isService;
  const hidesPrice = isJob;
  const serviceIsQuote = isService && form.servicePricingType === "quote";

  const priceLabel = isHome
    ? form.homeMode === "rent"
      ? "Monthly rent (USD)"
      : "Sale price (USD)"
    : isService
      ? "Starting price or quote (USD)"
      : isPet
        ? "Price or adoption fee (USD)"
        : "Price (USD)";

  const draftCallback = useRef(props.onDraftChange);
  draftCallback.current = props.onDraftChange;
  useEffect(() => {
    draftCallback.current?.(form);
  }, [form]);
  return {
    form,
    setForm,
    files,
    setFiles,
    photoRights,
    setPhotoRights,
    draggedPhotoIndex,
    setDraggedPhotoIndex,
    kind,
    set,
    isIdaho,
    unknownIdahoCity,
    cityInput,
    cityLeft,
    setCityLeft,
    setCity,
    selectKind,
    isVehicle,
    isHome,
    isJob,
    isService,
    isPet,
    hasSpecialDetails,
    formCopy,
    hidesCondition,
    hidesFulfillment,
    hidesPrice,
    serviceIsQuote,
    priceLabel,
    filePreviews,
    reorderFiles,
  };
}

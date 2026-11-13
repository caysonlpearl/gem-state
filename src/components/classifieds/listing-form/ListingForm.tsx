import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { traceMutation, trackEvent } from "@/lib/analytics";
import { usePhotoUploader } from "@/lib/use-photo-uploader";
import {
  createClassifiedListing,
  getClassifiedCategoryOptions,
  updateClassifiedListing,
} from "@/lib/classifieds.functions";
import { listingFormSubmission } from "./submission";
import { useListingFormState } from "./useListingFormState";
import { ListingFormView } from "./ListingFormView";
import { VehicleVinLookup } from "./VehicleVinLookup";
import type { ListingFormProps } from "./props";

export function ListingForm(props: ListingFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCategories = useServerFn(getClassifiedCategoryOptions);
  const create = useServerFn(createClassifiedListing);
  const update = useServerFn(updateClassifiedListing);
  const uploadPhoto = usePhotoUploader();
  const categories = useQuery({
    queryKey: ["classified-category-options"],
    queryFn: () => fetchCategories(),
  });

  const state = useListingFormState(props);
  const { form, files, photoRights, kind } = state;

  const mutation = useMutation({
    mutationFn: () => {
      void trackEvent("classified_listing_submit_started", { mode: props.mode, kind });
      return traceMutation(
        {
          flow: "classified_listing_submit",
          props: { mode: props.mode, kind },
        },
        async () => {
          const uploadNew = props.mode === "create" || files.length > 0;
          if (uploadNew) {
            if (props.mode === "create" && files.length === 0)
              throw new Error("Add at least one listing photo.");
            if (files.length > 0 && !photoRights)
              throw new Error("Confirm that you can publish these photos.");
          }

          const evidencePaths: string[] = [];
          const publicMediaPaths: string[] = [];
          if (files.length > 0) {
            const { data: session } = await supabase.auth.getSession();
            const uid = session.session?.user.id;
            if (!uid) throw new Error("Sign in required.");
            for (const file of files.slice(0, 8)) {
              const path = await uploadPhoto(file, uid, props.mode === "create");
              if (props.mode === "create") evidencePaths.push(path);
              publicMediaPaths.push(path);
            }
          }

          const payload = listingFormSubmission(form);

          if (props.mode === "create") {
            return create({
              data: { ...payload, evidencePaths, publicMediaPaths },
            });
          }

          return update({
            data: { listingId: props.listingId, ...payload, publicMediaPaths },
          });
        },
      );
    },
    onSuccess: async (result) => {
      const listingId =
        props.mode === "edit" ? props.listingId : "listingId" in result ? result.listingId : null;
      void trackEvent("classified_listing_submit_succeeded", {
        mode: props.mode,
        kind,
        listing_id: listingId ?? null,
        ...(props.mode === "create" && listingId ? { event_id: `create:${listingId}` } : {}),
      });
      if (props.mode === "edit") {
        await queryClient.invalidateQueries({
          queryKey: ["classified-listing-editor", props.listingId],
        });
        await queryClient.invalidateQueries({ queryKey: ["classified-browse"] });
        toast.success("Listing updated and submitted for Bluebird review.");
      } else {
        toast.success("Listing submitted for Bluebird review.");
      }
      await navigate({ to: "/selling" });
    },
    onError: (error) => {
      void trackEvent("classified_listing_submit_failed", {
        mode: props.mode,
        kind,
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      toast.error(
        error instanceof Error
          ? error.message
          : props.mode === "create"
            ? "Could not submit this listing."
            : "Could not update listing.",
      );
    },
  });

  return (
    <ListingFormView
      props={props}
      state={state}
      categories={categories.data ?? []}
      categoriesLoading={categories.isLoading}
      mutation={mutation}
      vinLookup={<VehicleVinLookup form={form} set={state.set} />}
    />
  );
}

export function ListingFormBackLink() {
  return (
    <Link
      to="/selling"
      className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={14} /> Seller dashboard
    </Link>
  );
}

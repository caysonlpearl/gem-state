import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyShopperPublicProfile,
  saveShopperPublicProfile,
  type ShopperPublicProfileDraft,
} from "@/lib/shopper.functions";

const empty: ShopperPublicProfileDraft = {
  slug: "",
  displayName: "",
  avatarUrl: "",
  bio: "",
  publicLocation: "",
};

/**
 * The shopper's own public-facing profile: photo, handle, display name, where
 * they shop from and a short bio. Everything here is deliberately public — no
 * address, phone number or document is ever shown.
 */
export function ShopperPublicProfileForm() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyShopperPublicProfile);
  const save = useServerFn(saveShopperPublicProfile);

  const profile = useQuery({
    queryKey: ["shopper-public-profile"],
    queryFn: () => fetchProfile(),
  });

  const [draft, setDraft] = useState<ShopperPublicProfileDraft>(empty);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      let avatarUrl = draft.avatarUrl;
      if (avatarFile) {
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        const ext =
          avatarFile.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${uid}/profile.${ext}`;
        const uploaded = await supabase.storage.from("shopper-avatars").upload(path, avatarFile, {
          contentType: avatarFile.type || "image/jpeg",
          upsert: true,
        });
        if (uploaded.error) throw new Error(`Photo upload failed: ${uploaded.error.message}`);
        avatarUrl = `${supabase.storage.from("shopper-avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      }
      return save({ data: { ...draft, avatarUrl } });
    },
    onSuccess: async () => {
      setAvatarFile(null);
      await queryClient.invalidateQueries({ queryKey: ["shopper-public-profile"] });
      toast.success("Your shopper profile is live.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile."),
  });

  const set = (key: keyof ShopperPublicProfileDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const previewUrl = avatarFile ? URL.createObjectURL(avatarFile) : draft.avatarUrl;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Public shopper profile</h2>
        {profile.data?.slug ? (
          <Link
            to="/shoppers/$slug"
            params={{ slug: profile.data.slug }}
            className="text-[12px] font-medium text-primary hover:underline"
          >
            View public profile
          </Link>
        ) : null}
      </div>

      <form
        className="space-y-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Buyers see this page before choosing an in-park shopper. Share your photo, a short bio and
          the parks you shop — never your address, phone number or ID.
        </p>

        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[18px] font-semibold">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (draft.displayName || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <label className="text-[12px]">
            <span className="block font-medium">Profile photo</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block text-[12px]"
              onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Display name"
            value={draft.displayName}
            onChange={set("displayName")}
            placeholder="Casey P."
          />
          <Field
            label="Shopper handle"
            value={draft.slug}
            onChange={(value) => set("slug")(value.toLowerCase())}
            placeholder="casey-wdw"
            hint={`${brand.domain}/shoppers/your-handle`}
          />
          <Field
            label="Where you're from"
            value={draft.publicLocation}
            onChange={set("publicLocation")}
            placeholder="Orlando, FL"
          />
        </div>

        <label className="block text-[12px]">
          <span className="block font-medium">Bio</span>
          <textarea
            value={draft.bio}
            maxLength={280}
            rows={3}
            onChange={(event) => set("bio")(event.target.value)}
            placeholder="Annual passholder at Walt Disney World. I shop Magic Kingdom and EPCOT most weekends."
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[12.5px]"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {draft.bio.length}/280
          </span>
        </label>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save shopper profile"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-[12px]">
      <span className="block font-medium">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-[12.5px]"
      />
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

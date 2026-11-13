import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, Camera, CheckCircle, Storefront } from "@phosphor-icons/react";

export type StartListingLinkProps = { className: string; children: ReactNode };
export function SellerSetupView({
  draft,
  avatarFile,
  setAvatarFile,
  set,
  saveMutation,
  exists,
  profileReady,
  sellerReady,
  navigation,
  renderStartLink: StartListingLink,
  error,
  notice,
  as: Container = "main",
}: {
  draft: Record<string, string | boolean> | null;
  avatarFile: File | null;
  setAvatarFile: (file: File | null) => void;
  set: (key: string, value: string | boolean) => void;
  saveMutation: { isPending: boolean; mutate: () => void };
  exists: boolean;
  profileReady: boolean;
  sellerReady: boolean;
  navigation?: ReactNode;
  renderStartLink: ComponentType<StartListingLinkProps>;
  error?: string;
  notice?: string;
  as?: "main" | "section";
}) {
  const [avatarPreview, setAvatarPreview] = useState("");
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);
  return (
    <Container className="mx-auto max-w-[940px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Seller center
          </p>
          <h1 className="mt-1 font-editorial text-[38px] font-normal tracking-[-0.035em]">
            Set up your shop
          </h1>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-muted-foreground">
            Your public storefront lives here. Add your profile and accept the seller agreement to
            start listing.
          </p>
        </div>
      </div>

      {navigation}

      <ol className="mt-7 grid gap-px border border-border bg-border sm:grid-cols-2">
        <SetupStep number="1" label="Seller information" complete={profileReady} />
        <SetupStep number="2" label="First listing" complete={false} />
      </ol>

      <div className="mt-7 max-w-[280px]">
        <div className="border border-border bg-card p-4">
          <Storefront size={20} className="text-primary" />
          <p className="mt-3 text-[11px] text-muted-foreground">Storefront</p>
          <p className="mt-0.5 text-[13px] font-semibold">{exists ? "Complete" : "Required"}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 text-sm text-primary">
          {notice}
        </p>
      )}
      {draft ? (
        <form
          className="mt-6 space-y-6 border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
              Step 1
            </p>
            <h2 className="mt-1 text-[15px] font-semibold">Public seller profile</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-center gap-4 border border-border bg-background p-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[20px] font-semibold">
                  {avatarPreview || draft["avatarUrl"] ? (
                    <img
                      src={avatarPreview || String(draft["avatarUrl"])}
                      alt="Seller profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    String(draft["displayName"] ?? "S")
                      .slice(0, 1)
                      .toUpperCase()
                  )}
                </div>
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-foreground px-3 text-[12px] font-medium">
                  <Camera size={15} />
                  Add profile picture
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · 5 MB maximum</p>
              </div>
              <Field
                label="Seller display name"
                value={String(draft["displayName"] ?? "")}
                onChange={(v) => set("displayName", v)}
                placeholder="Cayson's Park Finds"
              />
              <Field
                label="Seller handle"
                value={String(draft["slug"] ?? "")}
                onChange={(v) => set("slug", v)}
                placeholder="park-finds-by-cayson"
              />
              <label className="sm:col-span-2 text-[12px] font-medium">
                Short bio
                <textarea
                  value={String(draft["bio"] ?? "")}
                  maxLength={280}
                  rows={3}
                  onChange={(e) => set("bio", e.target.value)}
                  className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm"
                  placeholder="What you collect, where you source, and what buyers can expect."
                />
              </label>
            </div>
          </section>
          <label className="flex items-start gap-2 border-t border-border pt-5 text-[11.5px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(draft["acceptTerms"])}
              onChange={(e) => set("acceptTerms", e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to list only items I possess, describe condition accurately, arrange pickup or
              shipping directly with the buyer, and grant Bluebird Marketplace permission to display
              the listing photos I submit.
            </span>
          </label>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="h-10 bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save seller profile"}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-[12.5px] text-muted-foreground">Loading seller setup…</p>
      )}

      <section id="first-listing" className="mt-6 border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Step 2</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold">Create your first listing</h2>
            <p className="mt-1 max-w-[620px] text-[11.5px] leading-relaxed text-muted-foreground">
              Choose a category, add the exact item you own, and provide your photos, condition,
              location, price and package details.
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Buyers will contact you directly about the listing.
            </p>
          </div>
          <StartListingLink
            className={`inline-flex h-11 items-center gap-2 px-4 text-[12.5px] font-semibold ${
              sellerReady
                ? "bg-primary text-primary-foreground"
                : "pointer-events-none bg-secondary text-muted-foreground"
            }`}
          >
            Create your first listing
            <ArrowRight size={15} />
          </StartListingLink>
        </div>
      </section>
    </Container>
  );
}

function SetupStep({
  number,
  label,
  complete,
}: {
  number: string;
  label: string;
  complete: boolean;
}) {
  return (
    <li className="flex items-center gap-3 bg-card px-4 py-3">
      <span
        className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ${complete ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
      >
        {complete ? <CheckCircle size={16} weight="fill" /> : number}
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`text-[12px] font-medium ${className}`}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}

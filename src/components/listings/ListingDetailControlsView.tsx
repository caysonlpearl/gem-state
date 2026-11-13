import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brand } from "@/config/brand";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";
import { Flag } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useState } from "react";
import { toast } from "sonner";
import type { DetailLinkProps } from "./listing-detail-runtime";

const listingReportReasons = [
  "Scam or fraud",
  "Prohibited item",
  "Misleading information",
  "Unsafe or threatening",
  "Other",
] as const;

export function FlagListingDialogView({
  listingId,
  isMock = false,
  isSignedIn,
  onReport: report,
  renderLink: Link,
}: {
  listingId: string;
  isMock?: boolean;
  isSignedIn: boolean;
  onReport: (data: {
    listingId: string;
    reason: string;
    details: string;
  }) => Promise<{ alreadyReported?: boolean }>;
  renderLink: ComponentType<DetailLinkProps>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState<"new" | "duplicate" | null>(null);
  const reportMutation = useMutation({
    mutationFn: () => report({ listingId, reason, details }),
    onSuccess: (result) => {
      setSubmitted(result.alreadyReported ? "duplicate" : "new");
      setReason("");
      setDetails("");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit the report."),
  });

  if (isMock) {
    return (
      <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Reporting is available on published seller listings. This preview does not create a
        moderation record.
      </p>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSubmitted(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/5"
        >
          <Flag size={14} /> Flag this listing
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag this listing</DialogTitle>
          <DialogDescription>
            Tell us what looks wrong. Reports help Bluebird review unsafe, misleading, or prohibited
            listings.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-[12px] leading-relaxed">
            <p className="font-semibold text-primary">
              {submitted === "duplicate" ? "This listing is already reported." : "Report received."}
            </p>
            <p className="text-muted-foreground">
              {submitted === "duplicate"
                ? "Your existing report is already in the Bluebird moderation queue. We will not create a duplicate report."
                : "Your report is pending Bluebird moderation. We will review the listing and update the queue without changing your account state."}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : isSignedIn ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              reportMutation.mutate();
            }}
          >
            <label className="block text-[12px] font-medium">
              Reason
              <select
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
              >
                <option value="">Choose a reason</option>
                {listingReportReasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-medium">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, 500))}
                rows={4}
                maxLength={500}
                className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[12px] leading-relaxed"
                placeholder="What should our moderation team know?"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl border border-input px-4 text-[12px] font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportMutation.isPending}
                className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {reportMutation.isPending ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
            Sign in to report a listing. This helps us prevent duplicate or anonymous abuse reports.
            <Link
              to={brand.urls.auth}
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Jobs version of the directory claim: a partner posting names the
 * employer, but the business never asked to be listed. The owner claims it
 * to post their jobs directly; an admin verifies each claim first.
 */
export function ClaimEmployerPanelView({
  listing,
  employerName,
  runtime,
}: {
  listing: ClassifiedDetail;
  employerName: string;
  runtime: ClaimRuntime;
}) {
  const { isSignedIn, getClaim, submitClaim, renderLink: Link } = runtime;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>(claimRoles[0]);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const claim = useQuery({
    queryKey: ["employer-claim", employerName],
    queryFn: () => getClaim(),
    enabled: isSignedIn,
  });
  const mutation = useMutation({
    mutationFn: () => submitClaim({ role, contact, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employer-claim", employerName] });
      toast.success("Claim sent. We'll verify it with the business and email you.");
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send your claim."),
  });
  const mine = claim.data;
  if (isSignedIn && claim.isLoading)
    return (
      <p role="status" className="mt-5 text-xs text-muted-foreground">
        Checking your claim…
      </p>
    );
  if (claim.isError)
    return (
      <p role="alert" className="mt-5 text-xs text-destructive">
        Your claim status could not be checked.{" "}
        <button type="button" className="underline" onClick={() => void claim.refetch()}>
          Retry claim status
        </button>
      </p>
    );

  if (mine?.status === "approved") {
    return (
      <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-[12px] leading-relaxed">
        <p className="font-semibold text-primary">You manage this business on Bluebird.</p>
        <p className="mt-1 text-muted-foreground">
          Post your jobs directly with your logo, pay details and your own application link.
        </p>
        <Link
          to="/create-listing"
          className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
        >
          Post a job
        </Link>
      </div>
    );
  }
  if (mine?.status === "pending") {
    return (
      <p className="mt-5 rounded-xl bg-secondary/50 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
        Your claim is being reviewed. We'll verify it with the business and email you.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <p className="text-[13px] font-semibold">Is this your business?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Claim it free to post jobs directly, add your logo and reach local candidates on Bluebird.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-3 flex h-10 w-full items-center justify-center rounded-full border border-primary/40 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
          >
            Claim this business
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim {employerName}</DialogTitle>
            <DialogDescription>
              We verify every claim with the business before handing it over, usually within one or
              two business days.
            </DialogDescription>
          </DialogHeader>
          {isSignedIn ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              <label className="block text-[12px] font-medium">
                Your role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                >
                  {claimRoles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-medium">
                Business phone or email we can verify you at
                <input
                  required
                  value={contact}
                  onChange={(event) => setContact(event.target.value.slice(0, 200))}
                  placeholder="owner@yourbusiness.com"
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                />
              </label>
              <label className="block text-[12px] font-medium">
                Anything we should know?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 1000))}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[12px]"
                  placeholder="For example, a new phone number or that you moved."
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-xl border border-input px-4 text-[12px] font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {mutation.isPending ? "Sending…" : "Send claim"}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-border bg-secondary/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
              Sign in or create a free account to claim your business.
              <Link
                to={brand.urls.auth}
                className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const claimRoles = ["Owner", "Manager", "Employee authorized to manage listings"] as const;

export function ClaimBusinessPanelView({
  listing,
  runtime,
}: {
  listing: ClassifiedDetail;
  runtime: ClaimRuntime;
}) {
  const { isSignedIn, getClaim, submitClaim, renderLink: Link } = runtime;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>(claimRoles[0]);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const claim = useQuery({
    queryKey: ["service-claim", listing.id],
    queryFn: () => getClaim(),
    enabled: isSignedIn,
  });
  const mutation = useMutation({
    mutationFn: () => submitClaim({ role, contact, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["service-claim", listing.id] });
      toast.success("Claim sent. We'll verify it with the business and email you.");
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send your claim."),
  });
  const mine = claim.data;
  if (isSignedIn && claim.isLoading)
    return (
      <p role="status" className="mt-5 text-xs text-muted-foreground">
        Checking your claim…
      </p>
    );
  if (claim.isError)
    return (
      <p role="alert" className="mt-5 text-xs text-destructive">
        Your claim status could not be checked.{" "}
        <button type="button" className="underline" onClick={() => void claim.refetch()}>
          Retry claim status
        </button>
      </p>
    );

  if (mine?.status === "approved") {
    return (
      <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-[12px] leading-relaxed">
        <p className="font-semibold text-primary">You manage this business on Bluebird.</p>
        <p className="mt-1 text-muted-foreground">
          Post your full listing with photos, services and prices. It will show above this entry.
        </p>
        <Link
          to="/create-listing"
          className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
        >
          Post your listing
        </Link>
      </div>
    );
  }
  if (listing.directory?.claimed) return null;
  if (mine?.status === "pending") {
    return (
      <p className="mt-5 rounded-xl bg-secondary/50 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
        Your claim is being reviewed. We'll verify it with the business and email you.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <p className="text-[13px] font-semibold">Is this your business?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Claim it free to add photos, services, prices and take quote requests on Bluebird.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-3 flex h-10 w-full items-center justify-center rounded-full border border-primary/40 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
          >
            Claim this business
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim {listing.title}</DialogTitle>
            <DialogDescription>
              We verify every claim with the business before handing it over, usually within one or
              two business days.
            </DialogDescription>
          </DialogHeader>
          {isSignedIn ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              <label className="block text-[12px] font-medium">
                Your role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                >
                  {claimRoles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-medium">
                Business phone or email we can verify you at
                <input
                  required
                  value={contact}
                  onChange={(event) => setContact(event.target.value.slice(0, 200))}
                  placeholder={listing.directory?.phone ?? "owner@yourbusiness.com"}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-[12px]"
                />
              </label>
              <label className="block text-[12px] font-medium">
                Anything we should know?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 1000))}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[12px]"
                  placeholder="For example, a new phone number or that you moved."
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-xl border border-input px-4 text-[12px] font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {mutation.isPending ? "Sending…" : "Send claim"}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-border bg-secondary/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
              Sign in or create a free account to claim your business.
              <Link
                to={brand.urls.auth}
                className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export type ClaimRuntime = {
  isSignedIn: boolean;
  getClaim: () => Promise<{
    status: "pending" | "approved" | "rejected";
    createdAt: string;
  } | null>;
  submitClaim: (data: { role: string; contact: string; note: string }) => Promise<unknown>;
  renderLink: ComponentType<DetailLinkProps>;
};

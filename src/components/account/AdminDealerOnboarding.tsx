import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  onboardDealerAccount,
  getDealerMessageEmailStatus,
  sendDealerMessageEmailTest,
} from "@/lib/dealer-onboarding.functions";
import { getDealerInventorySources } from "@/lib/dealer-inventory.functions";

const fields = [
  ["displayName", "Dealership name"],
  ["slug", "Profile address"],
  ["ownerEmail", "Dealership login email"],
  ["email", "Public contact email"],
  ["phone", "Sales phone"],
  ["website", "Website"],
  ["logoUrl", "Official logo URL"],
  ["address", "Street address"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "ZIP code"],
] as const;
export function AdminDealerOnboarding() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const load = useServerFn(getDealerInventorySources);
  const onboard = useServerFn(onboardDealerAccount);
  const checkEmail = useServerFn(getDealerMessageEmailStatus);
  const sendEmailTest = useServerFn(sendDealerMessageEmailTest);
  const emailTest = useMutation({ mutationFn: () => sendEmailTest() });
  const emailStatus = useQuery({
    queryKey: ["dealer-message-email-status"],
    queryFn: () => checkEmail(),
    enabled: open,
  });
  const sources = useQuery({
    queryKey: ["dealer-onboarding-sources"],
    queryFn: () => load(),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: () => onboard({ data: { ...values, sourceId: values.sourceId || null } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-dealer-directory"] }),
  });
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm font-semibold text-primary"
      >
        {open ? "Close dealer onboarding" : "Add or complete a dealership account"}
      </button>
      {open ? (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Create or link the dealership login, complete its public business profile, assign its
            authorized feed and prepare its inbox. Buyer messages are saved before activation; the
            owner verifies their email to read and reply.
          </p>
          {emailStatus.data ? (
            <p role="status" className="text-sm text-muted-foreground">
              {emailStatus.data.message}
            </p>
          ) : null}
          <div className="space-y-2">
            <button
              type="button"
              disabled={emailTest.isPending || !emailStatus.data?.configured}
              onClick={() => emailTest.mutate()}
              className="rounded-full border border-input px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              {emailTest.isPending ? "Sending setup test…" : "Send a test to my inbox"}
            </button>
            {emailTest.error ? (
              <p role="alert" className="text-sm text-destructive">
                {emailTest.error.message}
              </p>
            ) : null}
            {emailTest.data ? (
              <p role="status" className="text-sm text-muted-foreground">
                The email provider accepted your test. Check your inbox. Reference:{" "}
                {emailTest.data.testId}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <label key={key} className="block text-sm font-medium">
                {label}
                <input
                  required
                  aria-label={label}
                  type={
                    key.toLowerCase().includes("email")
                      ? "email"
                      : key === "website" || key === "logoUrl"
                        ? "url"
                        : "text"
                  }
                  value={values[key] ?? ""}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium">
            Authorized inventory feed
            <select
              value={values.sourceId ?? ""}
              onChange={(e) => setValues({ ...values, sourceId: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"
            >
              <option value="">Assign a feed later</option>
              {sources.data?.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Use the dealer’s confirmed contact email. Buyer messages are saved immediately; they
            sign in with an email link. Existing accounts are reused. No invitation is sent
            automatically.
          </p>
          <button
            disabled={mutation.isPending}
            className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            {mutation.isPending ? "Setting up…" : "Complete dealer onboarding"}
          </button>
          {mutation.error ? (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          ) : null}
          {mutation.data ? (
            <p role="status" className="text-sm">
              Dealership account and profile are ready.{" "}
              {values.sourceId
                ? "Its authorized inventory is assigned. Buyer messages are saved; the owner verifies their login email to read and reply."
                : "Assign its authorized inventory feed to complete the inbox setup."}{" "}
              No invitation email has been sent.
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your account — Bluebird" },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: DeleteAccountPage,
});
function DeleteAccountPage() {
  const { user } = useAuth();
  const [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-semibold">Delete your Bluebird account</h1>
      <p className="my-5">
        Request deletion of your account, shopping history, saved preferences, and associated
        personal data. Records that must be retained for legal obligations or an unresolved dispute
        are handled separately under the privacy policy.
      </p>
      {!user ? (
        <p>
          <Link to="/auth" search={{ redirect: "/delete-account" }}>
            Sign in to verify ownership and request deletion.
          </Link>
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const session = (await (await loadSupabase()).auth.getSession()).data.session;
              if (!session) throw Error("Please sign in again.");
              const response = await fetch("/api/mobile/v1/account/deletion", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ confirm: confirmation }),
              });
              const result = await response.json();
              if (!response.ok) throw Error(result.error?.message ?? "Please try again.");
              setNotice(
                "Your deletion request has been received. You can check its status from your account in the app. Contact Bluebird if you need help with a pending request.",
              );
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "Your request could not be received.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            Type DELETE to confirm
            <input
              className="mt-2 block w-full rounded border p-3"
              required
              pattern="DELETE"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button className="rounded bg-primary px-5 py-3 text-primary-foreground" disabled={busy}>
            {busy ? "Requesting…" : "Request account deletion"}
          </button>
        </form>
      )}
      {notice && (
        <p className="my-5" role="status">
          {notice}
        </p>
      )}
      <p className="mt-8">
        <Link to="/policies">Read the privacy policy</Link> ·{" "}
        <Link to="/contact">Contact Bluebird</Link>
      </p>
    </section>
  );
}

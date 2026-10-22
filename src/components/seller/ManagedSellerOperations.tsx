import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createSellerClaimLink,
  type ManagedImportSeller,
  revokeSellerClaimLink,
  getManagedInbox,
  replyManagedConversation,
  replyManagedInquiry,
} from "@/lib/seller-claims.functions";
type ImportAudit = {
  action: string;
  actor_id: string;
  target_id: string | null;
  created_at: string;
};

export function ClaimLinkResult({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">Seller claim link</h3>
        <button type="button" onClick={onClose} className="text-sm underline">
          Hide link
        </button>
      </div>
      <p className="my-2 text-sm text-muted-foreground">
        Send this private link to this seller in your existing conversation. It expires in 30 days.
        Replacing it invalidates the previous link.
      </p>
      <input
        readOnly
        value={url}
        aria-label="Seller claim link"
        className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-xs"
      />
      <Button
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setError("");
          } catch {
            setError("Copy is unavailable here. Select and copy the link above.");
          }
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}

/** Compact actions live inside the imported seller's single expandable row. */
export function SellerClaimControls({
  seller,
  profile,
  name,
}: {
  seller?: ManagedImportSeller;
  profile: string;
  name: string;
}) {
  const create = useServerFn(createSellerClaimLink);
  const revoke = useServerFn(revokeSellerClaimLink);
  const client = useQueryClient();
  const [link, setLink] = useState("");
  const [confirm, setConfirm] = useState<"create" | "revoke" | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const createMutation = useMutation({
    mutationFn: () => create({ data: { profile, displayName: name, authorized } }),
    onSuccess: (r) => {
      setLink(r.url);
      setConfirm(null);
      void client.invalidateQueries({ queryKey: ["managed-import-sellers"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const revokeMutation = useMutation({
    mutationFn: () => revoke({ data: { sellerId: seller!.id } }),
    onSuccess: () => {
      setConfirm(null);
      setLink("");
      void client.invalidateQueries({ queryKey: ["managed-import-sellers"] });
      toast.success("Claim link revoked.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      {seller?.status === "Claimed" ? (
        <p className="text-xs text-muted-foreground">
          Account claimed. Listings and messages belong to this seller.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm("create")}>
              {seller?.expiresAt ? "Replace claim link" : "Create claim link"}
            </Button>
            {seller?.status === "Unclaimed" && seller.expiresAt && (
              <Button variant="outline" size="sm" onClick={() => setConfirm("revoke")}>
                Revoke link
              </Button>
            )}
          </div>
          {confirm && (
            <div className="rounded-xl border border-border bg-background p-3 text-xs space-y-3">
              {confirm === "create" ? (
                <>
                  <p>
                    {seller?.expiresAt
                      ? "Replacing the link stops the previous link from working. "
                      : ""}
                    The new private link appears once for you to copy and share.
                  </p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={authorized}
                      onChange={(e) => setAuthorized(e.target.checked)}
                    />
                    This seller authorized Bluebird to import and manage their listings.
                  </label>
                </>
              ) : (
                <p>
                  The claim link will stop working. Listings, ownership and buyer messages stay
                  intact.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={
                    confirm === "create"
                      ? !authorized || createMutation.isPending
                      : revokeMutation.isPending
                  }
                  onClick={() =>
                    confirm === "create" ? createMutation.mutate() : revokeMutation.mutate()
                  }
                >
                  {confirm === "create" ? "Create private claim link" : "Confirm revoke"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {link && <ClaimLinkResult url={link} onClose={() => setLink("")} />}
      {!!seller?.audit.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Activity history</summary>
          <ul className="mt-2 space-y-1">
            {seller.audit.map((a: ImportAudit) => (
              <li key={`${a.action}-${a.created_at}`}>
                {a.action.replaceAll("_", " ")} · {new Date(a.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ManagedSellerOperations() {
  return <ManagedSellerInbox />;
}
function ManagedSellerInbox() {
  const fetch = useServerFn(getManagedInbox);
  const reply = useServerFn(replyManagedConversation);
  const replyInquiry = useServerFn(replyManagedInquiry);
  const client = useQueryClient();
  const [active, setActive] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const inbox = useQuery({
    queryKey: ["managed-seller-inbox"],
    queryFn: () => fetch(),
    refetchInterval: 10000,
  });
  const send = useMutation({
    mutationFn: async () => {
      if ((inbox.data ?? []).find((t) => t.id === active)?.legacy)
        await replyInquiry({ data: { inquiryId: active, body } });
      else await reply({ data: { conversationId: active, body } });
    },
    onSuccess: () => {
      setBody("");
      void client.invalidateQueries({ queryKey: ["managed-seller-inbox"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const threads = (inbox.data ?? []).filter((t) =>
    `${t.title} ${t.sellerName}`.toLowerCase().includes(query.toLowerCase()),
  );
  const thread = threads.find((t) => t.id === active);
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Managed seller inbox</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Reply on behalf of unclaimed sellers. When they claim, conversations move to their account.
      </p>
      {inbox.isError ? (
        <p role="alert" className="mt-3 text-sm">
          Inbox could not load.{" "}
          <button className="underline" onClick={() => void inbox.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <>
          <input
            aria-label="Search managed conversations"
            placeholder="Search seller or listing"
            className="field mt-3 w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActive(t.id);
                    setBody("");
                  }}
                  className={`w-full rounded-xl p-3 text-left text-sm ${active === t.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  <strong className="block">{t.title}</strong>
                  <span className="text-xs">
                    {t.sellerName}
                    {t.legacy ? " · Inquiry" : ""}
                  </span>
                </button>
              ))}
              {!threads.length && (
                <p className="text-sm text-muted-foreground">
                  No buyer inquiries for unclaimed sellers.
                </p>
              )}
            </div>
            <div>
              {thread ? (
                <>
                  <h3 className="text-sm font-semibold">
                    {thread.title} · {thread.sellerName}
                  </h3>
                  <div className="my-3 max-h-96 space-y-3 overflow-y-auto">
                    {thread.messages.map(
                      (m: {
                        id: string;
                        label: string;
                        body: string;
                        attachmentUrl: string | null;
                        createdAt: string;
                      }) => (
                        <article key={m.id} className="rounded-xl bg-secondary p-3 text-sm">
                          <p className="mb-1 text-xs font-semibold">{m.label}</p>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          {m.attachmentUrl && (
                            <a
                              className="mt-2 block underline"
                              href={m.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open attachment
                            </a>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                        </article>
                      ),
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!send.isPending) send.mutate();
                    }}
                  >
                    <label className="text-sm">
                      Reply as Bluebird on behalf of {thread.sellerName}
                      <textarea
                        required
                        maxLength={5000}
                        rows={3}
                        className="field mt-2 w-full"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <button disabled={send.isPending || !body.trim()} className="btn-primary mt-2">
                      {send.isPending ? "Sending…" : "Send reply"}
                    </button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a buyer conversation.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

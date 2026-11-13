import { useState, type ComponentType } from "react";
import { useMutation } from "@tanstack/react-query";
import type { StorefrontLinkProps } from "@/components/storefronts/storefront-types";
export type DealerContactRuntime = {
  isSignedIn: boolean;
  userId?: string;
  ready?: boolean;
  Link: ComponentType<StorefrontLinkProps>;
  onSend: (data: { dealerId: string; body: string }) => Promise<{ conversationId: string }>;
  onSent: (id: string) => void;
};
export function DealerContactPanelView({
  dealerId,
  name,
  slug,
  ownerUserId,
  compose = false,
  runtime,
}: {
  dealerId: string;
  name: string;
  slug: string;
  ownerUserId?: string;
  compose?: boolean;
  runtime: DealerContactRuntime;
}) {
  const { isSignedIn, userId, onSend, onSent, Link, ready = true } = runtime;
  const user = { id: userId };
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(compose);
  const send = useMutation({
    mutationFn: () => onSend({ dealerId, body }),
    onSuccess: (result) => {
      setBody("");
      onSent(result.conversationId);
    },
  });
  if (user?.id && user.id === ownerUserId)
    return (
      <Link
        to="/account"
        search={{ section: "messages" }}
        className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
      >
        Open dealership inbox
      </Link>
    );
  return (
    <div id="dealer-contact-panel" className={compose ? "max-w-xl" : "mt-5 max-w-xl"}>
      {!isSignedIn ? (
        <Link
          id="dealer-message-trigger"
          to="/auth"
          search={{ redirect: `/dealers/${slug}` }}
          className="inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign in to message dealership
        </Link>
      ) : !compose ? (
        <button
          id="dealer-message-trigger"
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Message dealership
        </button>
      ) : null}
      {open && isSignedIn && !ready ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Dealership messaging is temporarily unavailable. You can still use the dealership’s other
          contact options.
        </p>
      ) : null}
      {open && isSignedIn && ready ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <label className="block text-sm font-medium" htmlFor="dealer-message">
            Message {name}
          </label>
          <textarea
            id="dealer-message"
            disabled={send.isPending}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={10}
            maxLength={5000}
            required
            className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm"
          />
          <button
            disabled={send.isPending}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            {send.isPending ? "Sending…" : "Send message"}
          </button>
          {send.error ? (
            <p role="alert" className="text-sm text-destructive">
              {send.error.message}
            </p>
          ) : null}
          {send.data ? (
            <p role="status" className="text-sm">
              Message saved to the dealership inbox.{" "}
              <Link
                to="/account"
                search={{ section: "messages", conversation: send.data.conversationId }}
                className="text-primary underline"
              >
                Open conversation
              </Link>
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { startDealerConversation } from "@/lib/conversation.functions";
import { trackBusinessEvent } from "@/lib/business-analytics";
import type { BusinessIdentity } from "@/lib/business-performance";

export function DealerContactPanel({
  dealerId,
  name,
  slug,
  ownerUserId,
  compose = false,
  business,
}: {
  dealerId: string;
  name: string;
  slug: string;
  ownerUserId?: string;
  compose?: boolean;
  business?: BusinessIdentity;
}) {
  const { isSignedIn, user } = useAuth();
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(compose);
  const start = useServerFn(startDealerConversation);
  const send = useMutation({
    mutationFn: () => start({ data: { dealerId, body } }),
    onSuccess: (result) => {
      setBody("");
      if (business)
        trackBusinessEvent("business_inquiry_completed", business, {
          event_id: "dealer-inquiry:" + result.conversationId,
        });
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
      {open && isSignedIn ? (
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

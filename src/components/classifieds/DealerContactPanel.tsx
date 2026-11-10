import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { startDealerConversation } from "@/lib/conversation.functions";

export function DealerContactPanel({
  dealerId,
  name,
  slug,
  ownerUserId,
}: {
  dealerId: string;
  name: string;
  slug: string;
  ownerUserId?: string;
}) {
  const { isSignedIn, user } = useAuth();
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const start = useServerFn(startDealerConversation);
  const send = useMutation({
    mutationFn: () => start({ data: { dealerId, body } }),
    onSuccess: () => setBody(""),
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
    <div className="mt-5 max-w-xl">
      {!isSignedIn ? (
        <Link
          to="/auth"
          search={{ redirect: `/dealers/${slug}` }}
          className="inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign in to message dealership
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Message dealership
        </button>
      )}
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

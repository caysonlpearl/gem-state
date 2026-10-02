import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/messages")({ component: MessagesRedirect });

function MessagesRedirect() {
  const navigate = useNavigate();
  const { isSignedIn, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isSignedIn) {
      void navigate({ to: "/account", search: { section: "messages" }, replace: true });
    } else {
      void navigate({ to: "/auth", search: { redirect: "/account" }, replace: true });
    }
  }, [isSignedIn, loading, navigate]);

  return (
    <main className="mx-auto max-w-[760px] px-4 py-16">
      <h1 className="text-xl font-semibold">Messages</h1>
      <p className="mt-2 text-sm text-muted-foreground">Opening your messages.</p>
      <a
        href="/auth?redirect=%2Faccount"
        className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Sign in to view messages
      </a>
    </main>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";
import { submitContactMessage } from "@/lib/contact.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const title = "Contact ParkVault";
const description =
  "Send the ParkVault team a message about an order, a listing, an in-park sourcing job, or anything else you need help with.";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: `${title} — ${brand.name}` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const send = useServerFn(submitContactMessage);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void trackEvent("page_view", { route: "/contact" });
  }, []);

  const mutation = useMutation({
    mutationFn: () => send({ data: { name, email, subject, message } }),
    onSuccess: () => {
      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      toast.success("Message sent — we'll reply by email.");
    },
    onError: (error: unknown) => {
      const raw = error instanceof Error ? error.message : "";
      toast.error(
        raw.includes("could not send") || raw.length === 0
          ? "We could not send your message. Please try again."
          : "Please check the form and try again.",
      );
    },
  });

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {description} Include your order number if your question is about a purchase or a sale.
      </p>

      {sent ? (
        <div
          role="status"
          className="mt-7 rounded-md border border-border bg-surface p-5 text-[13.5px] leading-relaxed text-foreground"
        >
          <p className="font-semibold">Your message is with the ParkVault team.</p>
          <p className="mt-1 text-muted-foreground">
            We reply to the email address you provided. You can send another message below if you
            need to add anything.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setSent(false)}>
            Send another message
          </Button>
        </div>
      ) : (
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            if (message.trim().length < 10) {
              toast.error("Tell us a little more so we can help.");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Your name</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email address</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-subject">Subject</Label>
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              maxLength={4000}
              required
              aria-describedby="contact-message-help"
            />
            <p id="contact-message-help" className="text-[12px] text-muted-foreground">
              {message.trim().length}/4000 characters. Do not include payment card numbers or
              passwords.
            </p>
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Send message"}
          </Button>
        </form>
      )}
    </main>
  );
}

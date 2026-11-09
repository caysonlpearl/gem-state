import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";
import {
  contactSearch,
  type ContactAcknowledgement,
  type ContactInterest,
} from "@/lib/contact-contract";
import { trackDealerLead } from "@/lib/dealer-ads";
import { submitContactMessage } from "@/lib/contact.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const title = "Contact Bluebird Marketplace";
const description =
  "Send the Bluebird Marketplace team a message about an order, listing, payment, delivery, or anything else you need help with.";

export const Route = createFileRoute("/contact")({
  validateSearch: contactSearch,
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
  const search = Route.useSearch();
  const send = useServerFn(submitContactMessage);
  const [interest, setInterest] = useState<ContactInterest>(search.interest ?? "general");
  const [dealershipName, setDealershipName] = useState("");
  const [phone, setPhone] = useState("");
  const [acknowledged, setAcknowledged] = useState<ContactAcknowledgement | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(
    search.interest === "dealership" ? "Connect my dealership to Bluebird" : "",
  );
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void trackEvent("page_view", { route: "/contact" });
  }, []);

  useEffect(() => {
    if (sent && acknowledged) trackDealerLead(acknowledged);
  }, [sent, acknowledged]);

  const mutation = useMutation({
    retry: false,
    mutationFn: () =>
      send({ data: { name, email, subject, message, interest, dealershipName, phone } }),
    onSuccess: (result) => {
      setAcknowledged(result);
      setDealershipName("");
      setPhone("");
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
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {interest === "dealership" ? "Get your dealership on Bluebird" : title}
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {interest === "dealership"
          ? "Reach local vehicle buyers in Idaho and Utah. Tell us about your dealership and the inventory you want to list, and our team will help you get started."
          : `${description} Include your order number if your question is about a purchase or a sale.`}
      </p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
        Email us directly at{" "}
        <a
          className="break-all font-semibold text-primary underline underline-offset-4"
          href={`mailto:${brand.supportEmail}`}
        >
          {brand.supportEmail}
        </a>
        , or use the form below.
      </p>

      {sent ? (
        <div
          role="status"
          className="mt-7 rounded-md border border-border bg-surface p-5 text-[13.5px] leading-relaxed text-foreground"
        >
          <p className="font-semibold">Your message is with the Bluebird Marketplace team.</p>
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
          <div className="space-y-1.5">
            <Label htmlFor="contact-interest">What can we help with?</Label>
            <select
              id="contact-interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value as ContactInterest)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="general">General question or support</option>
              <option value="dealership">Dealership inventory & partnership</option>
              <option value="advertising">Advertising & local business</option>
            </select>
          </div>
          {interest === "dealership" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contact-dealership">Dealership name</Label>
                <Input
                  id="contact-dealership"
                  value={dealershipName}
                  onChange={(e) => setDealershipName(e.target.value)}
                  autoComplete="organization"
                  maxLength={160}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">Business phone (optional)</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  maxLength={40}
                />
              </div>
            </div>
          )}
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
              maxLength={interest === "dealership" ? 3500 : 4000}
              required
              aria-describedby="contact-message-help"
            />
            <p id="contact-message-help" className="text-[12px] text-muted-foreground">
              {message.trim().length}/{interest === "dealership" ? 3500 : 4000} characters. Do not
              include payment card numbers or passwords.
            </p>
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Sending…"
              : interest === "dealership"
                ? "Contact the dealership team"
                : "Send message"}
          </Button>
          {interest === "dealership" && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              We use OpenAI ad measurement on successful dealership inquiries to understand which
              ads bring us new partners.{" "}
              <a href="/policies#privacy" className="underline">
                Privacy details
              </a>
              .
            </p>
          )}
        </form>
      )}
    </main>
  );
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react";
import { DealerActionArt } from "./DealerActionArt";
import { DealerContactOptions } from "./DealerContactOptions";
import { ArrowUpRight, SealCheck, Envelope } from "@phosphor-icons/react";
import type { PublicDealerProfile } from "@/lib/dealer.functions";
import { DealerContactPanel } from "@/components/classifieds/DealerContactPanel";

export function DealerStorefrontHeader({ dealer }: { dealer: PublicDealerProfile }) {
  const [contactOpen, setContactOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const location = [dealer.city, dealer.state].filter(Boolean).join(", ");
  const address = [dealer.addressLine1, location, dealer.postalCode].filter(Boolean).join(", ");
  const count = dealer.listingCount ?? dealer.listings.length;
  const actionClass =
    "group flex min-h-24 items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <section
      aria-label={`${dealer.displayName} dealership profile`}
      className="overflow-hidden rounded-[28px] border border-primary/10 bg-card shadow-[0_14px_50px_-32px_rgba(13,43,59,0.35)]"
    >
      <div className="relative overflow-hidden bg-[#113345] px-6 py-8 text-white sm:px-9 sm:py-10">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#f5c900]" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-40 h-96 w-96 rounded-full border-[56px] border-white/[0.025]"
        />
        <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="grid h-24 w-64 shrink-0 place-items-center rounded-2xl bg-white px-4 shadow-sm sm:h-28 sm:w-72">
            {dealer.logoUrl ? (
              <img
                src={dealer.logoUrl}
                alt={`${dealer.displayName} logo`}
                className="max-h-20 w-full object-contain"
              />
            ) : (
              <span className="text-4xl font-semibold text-[#113345]">
                {dealer.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
              {[dealer.city, dealer.state === "ID" ? "Idaho" : dealer.state]
                .filter(Boolean)
                .join(", ") || "Idaho"}
            </p>
            <h1 className="flex flex-wrap items-center gap-3 font-editorial text-[34px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[44px]">
              {dealer.displayName}
              <span
                role="img"
                aria-label="Verified dealership"
                title="Verified dealership"
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white p-1 text-[#1576b8]"
              >
                <SealCheck size={26} weight="fill" aria-hidden="true" />
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/75">
              Browse current vehicles and connect directly with the dealership.
            </p>
          </div>
          <div className="flex items-center gap-4 border-l border-white/20 pl-5 lg:block lg:min-w-28 lg:text-right">
            <p className="numeric text-[38px] font-semibold leading-none tracking-tight sm:text-[46px]">
              {count.toLocaleString()}
            </p>
            <p className="text-[11px] leading-relaxed text-white/65 lg:mt-2">vehicles available</p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div
          className={`grid gap-3 sm:grid-cols-2 ${dealer.email ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
        >
          {dealer.phone ? (
            <a href={`tel:${dealer.phone.replace(/[^\d+]/g, "")}`} className={actionClass}>
              <DealerActionArt kind="phone" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Call dealership</span>
                <span className="mt-1 block text-[12px] text-muted-foreground">{dealer.phone}</span>
              </span>
              <ArrowUpRight
                size={15}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          ) : null}
          {dealer.addressLine1 ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionClass}
            >
              <DealerActionArt kind="map" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Get directions</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {dealer.addressLine1}
                  <br />
                  {location} {dealer.postalCode}
                </span>
              </span>
              <ArrowUpRight
                size={15}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          ) : null}
          {dealer.website ? (
            <a
              href={dealer.website}
              target="_blank"
              rel="noopener noreferrer"
              className={actionClass}
            >
              <DealerActionArt kind="web" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Visit website</span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  Dealership website
                </span>
              </span>
              <ArrowUpRight
                size={15}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          ) : null}
          {dealer.email ? (
            <a href={`mailto:${dealer.email}`} className={actionClass}>
              <span className="grid h-16 w-16 shrink-0 place-items-center text-primary">
                <Envelope size={21} weight="duotone" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Email dealership</span>
                <span className="mt-1 block break-all text-[11px] text-muted-foreground">
                  {dealer.email}
                </span>
              </span>
            </a>
          ) : null}
          <a href="#dealer-inventory" className={actionClass}>
            <DealerActionArt kind="car" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">View inventory</span>
              <span className="mt-1 block text-[12px] text-muted-foreground">
                {count.toLocaleString()} current vehicles
              </span>
            </span>
          </a>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            Questions about a vehicle? Connect directly with the dealership.
          </p>
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            <ChatCircleDots size={19} /> Contact dealership
          </button>
        </div>
        <DealerContactOptions
          open={contactOpen}
          onOpenChange={setContactOpen}
          name={dealer.displayName}
          phone={dealer.phone}
          email={dealer.email}
          website={dealer.website}
          messagingEnabled={Boolean(dealer.messagingEnabled)}
          onMessage={() => setMessageOpen(true)}
        />
        {dealer.messagingEnabled ? (
          <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
            <DialogContent className="max-w-[520px] rounded-[28px]">
              <DialogHeader>
                <DialogTitle>Message {dealer.displayName}</DialogTitle>
                <DialogDescription>
                  Ask about a vehicle or connect with the dealership on Bluebird.
                </DialogDescription>
              </DialogHeader>
              <DealerContactPanel
                dealerId={dealer.id}
                name={dealer.displayName}
                slug={dealer.slug}
                ownerUserId={dealer.ownerUserId}
                compose
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </section>
  );
}

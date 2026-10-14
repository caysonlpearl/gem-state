import { useState } from "react";
import { Check, Copy, FacebookLogo, LinkSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";
import {
  SELLER_BADGE_IMAGE,
  sellerBadgeHtml,
  sellerShareCaption,
  sellerShareUrl,
} from "@/lib/seller-share";

const buttonClass =
  "inline-flex min-h-10 items-center gap-1.5 border border-input bg-card px-3 text-[12px] font-medium transition-colors hover:border-foreground hover:bg-secondary";

/**
 * Everything a seller needs to send their own audience to their Bluebird
 * storefront: a tagged link, a ready-made post, a one-click Facebook share and
 * a badge for their website. Visits and contacts from these show up in the
 * admin traffic page under "Seller share links".
 */
export function ShareStorefront({
  slug,
  displayName,
  activeListingCount,
}: {
  slug: string;
  displayName: string;
  activeListingCount: number;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const link = sellerShareUrl(slug);
  const post = `${sellerShareCaption(activeListingCount)} ${link}`;
  const badge = sellerBadgeHtml(slug, displayName || slug);

  async function copy(kind: "link" | "post" | "badge", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
      toast.success(
        kind === "link" ? "Link copied." : kind === "post" ? "Post copied." : "Badge code copied.",
      );
      void trackEvent("storefront_share", { kind });
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const copyLabel = (kind: string, label: string) => (
    <>
      {copied === kind ? <Check size={14} weight="bold" /> : <Copy size={14} />}
      {copied === kind ? "Copied" : label}
    </>
  );

  return (
    <section id="share" className="mt-9 scroll-mt-28 border border-border bg-card p-5">
      <h2 className="text-[14px] font-semibold">Share your listings</h2>
      <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-muted-foreground">
        Post your storefront link on Facebook, in local groups, on your website or in your bio.
        Buyers land on every listing you have up and message you directly.
        {activeListingCount === 0
          ? " Your storefront will show listings as soon as one is approved."
          : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 border border-border bg-secondary/50 px-3 text-[12px]">
          <LinkSimple size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{link.replace(/^https:\/\//, "").split("?")[0]}</span>
        </span>
        <button type="button" onClick={() => void copy("link", link)} className={buttonClass}>
          {copyLabel("link", "Copy link")}
        </button>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void trackEvent("storefront_share", { kind: "facebook" })}
          className={buttonClass}
        >
          <FacebookLogo size={15} weight="fill" />
          Share on Facebook
        </a>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold">Ready-made post</p>
          <p className="mt-2 border border-border bg-secondary/40 px-3 py-2.5 text-[12.5px] leading-relaxed">
            {post}
          </p>
          <button
            type="button"
            onClick={() => void copy("post", post)}
            className={`${buttonClass} mt-2`}
          >
            {copyLabel("post", "Copy post")}
          </button>
        </div>
        <div>
          <p className="text-[12px] font-semibold">Badge for your website</p>
          <img
            src={SELLER_BADGE_IMAGE}
            alt="Shop my listings on Bluebird"
            width={220}
            height={64}
            loading="lazy"
            className="mt-2"
          />
          <pre className="mt-2 whitespace-pre-wrap break-all border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
            {badge}
          </pre>
          <button
            type="button"
            onClick={() => void copy("badge", badge)}
            className={`${buttonClass} mt-1`}
          >
            {copyLabel("badge", "Copy badge code")}
          </button>
        </div>
      </div>
    </section>
  );
}

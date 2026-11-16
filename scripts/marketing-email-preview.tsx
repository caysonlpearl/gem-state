import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { render } from "@react-email/render";
import { ShoppingMarketingEmail } from "../src/lib/email-templates/shopping-alert";
import {
  MARKETING_CAMPAIGNS,
  marketingPrice,
  type MarketingCampaign,
} from "../src/lib/shopping-marketing";
import type { ShoppingCard } from "../src/lib/shopping-contract";
import { brand } from "../src/config/brand";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: tsx scripts/marketing-email-preview.tsx <public-cards.json> <output-directory>",
  );
const cards = JSON.parse(readFileSync(resolve(input), "utf8")) as ShoppingCard[];
if (!Array.isArray(cards) || !cards.length) throw Error("Public listing cards are required.");
const directory = resolve(output);
mkdirSync(directory, { recursive: true });
const items = cards.slice(0, 6).map((card) => ({
  title: card.title,
  price: marketingPrice(card.priceCents),
  imageUrl: card.imageUrl ?? undefined,
  location: [card.city, card.state].filter(Boolean).join(", "),
  url: `${brand.urls.siteUrl}/listings/${encodeURIComponent(card.id)}`,
  reason: "Layout preview using a public Bluebird listing",
}));
const links: string[] = [];
for (const campaign of Object.keys(MARKETING_CAMPAIGNS) as MarketingCampaign[]) {
  const html = await render(
    <ShoppingMarketingEmail
      campaign={campaign}
      items={items}
      moreUrl={`${brand.urls.siteUrl}/notifications`}
      preferencesUrl={`${brand.urls.siteUrl}/account?tab=settings`}
      unsubscribeUrl="#preview-only-unsubscribe"
    />,
  );
  const file = `${campaign}.html`;
  writeFileSync(resolve(directory, file), html);
  links.push(`<a href="${file}" target="email-preview">${MARKETING_CAMPAIGNS[campaign].name}</a>`);
}
writeFileSync(
  resolve(directory, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bluebird marketing email previews</title><style>body{margin:0;font:15px/1.5 Arial,sans-serif;color:#15364b;background:#f8f7f2}header{padding:20px 24px;border-bottom:1px solid #dbe2e5;background:white}h1{font-size:23px;margin:0 0 6px}p{margin:0;color:#51616d}main{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px;padding:24px}nav a{display:block;padding:9px 12px;color:#15364b;text-decoration:none;border-radius:6px}nav a:hover,nav a:focus{background:#e6f1f8}button{padding:9px 16px;margin-right:8px;border:1px solid #b7c9d2;border-radius:6px;background:white;color:#15364b;cursor:pointer}iframe{display:block;box-sizing:border-box;width:100%;max-width:600px;height:1080px;border:1px solid #dbe2e5;background:white;margin-top:16px}@media(max-width:700px){main{display:block;padding:12px}nav{display:flex;overflow:auto;gap:6px;margin-bottom:16px}nav a{white-space:nowrap}iframe{max-width:100%}}</style></head><body><header><h1>Bluebird marketing emails</h1><p>Ten situational templates. Preview data uses public listings; these previews do not assert a price change, a saved search, or a member’s browsing activity. Nothing is sent.</p></header><main><nav aria-label="Email types">${links.join("")}</nav><section aria-label="Email preview"><button type="button" onclick="document.querySelector('iframe').style.maxWidth='600px'">Desktop</button><button type="button" onclick="document.querySelector('iframe').style.maxWidth='390px'">Phone</button><iframe title="Marketing email layout" name="email-preview" src="welcome.html"></iframe></section></main></body></html>`,
);
console.log(`Rendered ${links.length} email layouts to ${directory}/index.html`);

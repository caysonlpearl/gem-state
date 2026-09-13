# Magic Finds Marketplace

Build a production-quality validation MVP for a curated Disney Parks merchandise marketplace.

Working name: ParkVault.

ParkVault is a temporary working name. Store the brand name, logo, colors, fees, URLs, contact information, and legal language in centralized configuration so they can be replaced without editing individual components.

ParkVault is an independent marketplace and is not affiliated with, endorsed by, or sponsored by The Walt Disney Company. Do not use Disney logos, Disney fonts, copied Disney artwork, scraped merchandise images, StockX branding, or anything implying an official relationship.

Before writing code

First:

Produce a concise implementation plan.

Show the proposed database schema.

Explain the user roles and access-control model.

Identify architectural or security risks.

Divide implementation into phases.

Ask no more than five questions, and only if they materially block implementation.

Wait for my approval before building.

Do not immediately generate an entire application without establishing the architecture.

Product hypothesis

People who cannot obtain a specific Disney Parks product will prefer one centralized marketplace where they can:

Find one authoritative page for the exact product.

Select the exact size, color, or edition.

Compare multiple sellers and prices.

Buy from someone who already possesses the item.

Request acquisition from an approved local shopper.

Place a Bid representing what they are willing to pay.

See recent community-reported park sightings.

Submit a photograph when they do not know the product name.

Understand retail price, marketplace fees, shopper compensation, shipping, and estimated total cost.

Complete the transaction through a more structured and protected process than contacting strangers through social media.

The MVP must measure whether buyers, sellers, and shoppers actually perform these actions. It is not intended to contain every possible marketplace feature at launch.

Initial scope

For the MVP:

Walt Disney World and Disneyland merchandise only.

USD only.

Focus on current park-exclusive apparel, bags, ears, accessories, and collectibles.

Prioritize products approximately between $50 and $200.

Allow future expansion to international resorts through the database model.

Anonymous users may browse.

Authentication is required to Bid, buy, sell, submit requests, watch products, report sightings, or apply as a shopper.

Do not initially build:

Trading

Auctions

Livestream shopping

Direct user-to-user messaging

Automated authentication

AI product identification

International payments

Subscriptions

Loyalty programs

Social feeds

Build clean service boundaries so those features can be added later if the marketplace is validated.

StockX-inspired functionality

Use StockX as the primary inspiration for the marketplace structure, product-page layout, catalog organization, and transaction mechanics.

Do not copy StockX’s branding, colors, logo, exact wording, icons, or pixel-level design.

The central rule is:

One canonical product page for each exact product, with multiple Bids and Asks underneath it.

Do not build a Mercari-style feed containing hundreds of separate public listings for the same product.

The user journey should be:

Find the canonical product.

Select the exact variation.

View the current market for that variation.

Buy Now, Place a Bid, Sell Now, Place an Ask, or Request Sourcing.

Marketplace concepts

Use these concepts:

Ask: The price at which a seller or approved shopper is willing to provide the item.

Bid: The price a buyer is willing to pay for the exact product and variation.

Buy Now: The buyer accepts the current lowest eligible Ask.

Sell Now: The seller accepts the current highest eligible Bid.

Place Ask: The seller selects their desired selling price.

Place Bid: The buyer enters the maximum merchandise price they are willing to pay.

In-hand Ask: The seller already possesses the item.

Sourcing Ask: An approved shopper believes they can acquire the item within a disclosed timeframe.

Request Sourcing: The buyer requests a product that has no active Ask or cannot yet be identified.

Sighting: A timestamped community report that a product was seen at a particular store.

Explain these terms in plain language during onboarding. Do not assume ordinary Disney shoppers understand StockX terminology.

Canonical product catalog

Every product must have a structured canonical record.

The catalog should support:

Product name

Slug

Brand

Collection

Category

Description

Resort

Release information

Original retail price

Retail-price source and observation date

You can use StockX as inspiration for design as well, but should be softer due the fantastical theme park feel. do NOT use the default lucide-react icons.  Use a different icon library. In fact, dont use any of the default design features. I do NOT want this to look or feel vibe coded at all.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a00b3be0-450f-457d-b870-8f26358ccb17).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

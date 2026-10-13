/**
 * Glossary terms, grouped by topic. Idaho-specific facts (fees, deadlines,
 * thresholds) come from the same official sources as the guides, listed in
 * `glossarySources`; re-check them when the guides are re-reviewed.
 * Inline links use [label](/path), rendered like guide text.
 */

export type GlossaryTerm = { term: string; short: string; body: string };
export type GlossarySection = { heading: string; terms: GlossaryTerm[] };

export const glossaryReviewed = "2026-10-13";

export const glossarySections: GlossarySection[] = [
  {
    heading: "How Bluebird works",
    terms: [
      {
        term: "Listing",
        short: "What a seller wants for an item",
        body: "A listing is one seller's offer to sell one specific item. It includes the item's title, condition, price, photos, location and pickup or shipping options. Cars and trucks can also include year, make, model, mileage, drivetrain, title status and other vehicle details.",
      },
      {
        term: "Offer",
        short: "A price discussed with the seller",
        body: "Offers and checkout are reserved for a future marketplace phase. For now, contact the seller directly to discuss price, condition and availability before making payment.",
      },
      {
        term: "Contact seller",
        short: "Message the person who listed the item",
        body: "Contact seller sends your message and email address to the seller of that exact listing. Continue the conversation directly to confirm the item, price, meeting place, shipping and payment details.",
      },
      {
        term: "Seller review",
        short: "Moderation before publication",
        body: "New listings are reviewed for prohibited items, missing information and clear photos before they appear publicly. Approval does not authenticate, inspect or guarantee an item.",
      },
      {
        term: "Pickup or shipping",
        short: "How the buyer receives the item",
        body: "A seller chooses local pickup, shipping, or both when creating a listing. Ask the seller about pickup details, shipping availability and cost, then arrange the details directly.",
      },
      {
        term: "Saved listing",
        short: "A private listing bookmark",
        body: "Saving a listing adds it to your private saved list so you can find the exact item again. Saved listings are not public and do not reserve the item.",
      },
      {
        term: "Moderation",
        short: "A marketplace safety review",
        body: "Bluebird Marketplace may review listing content and photos before publication and may remove listings that violate the published policies. Moderation is not an inspection or a warranty.",
      },
      {
        term: "Buyer inquiry",
        short: "A message about one listing",
        body: "A buyer inquiry is a message attached to one exact listing. The seller can read it in Seller Center and reply to the buyer by email.",
      },
      {
        term: "Sold or expired listing",
        short: "A listing that's no longer available",
        body: "When a seller marks a listing sold, or it reaches its end date, it leaves search. Its page stays up for up to 60 days with a Sold or Expired notice and a link to similar listings nearby, then redirects to the matching city and category page.",
      },
      {
        term: "Seller payout",
        short: "Not currently available",
        body: "Bluebird Marketplace does not process buyer payments or seller payouts through the marketplace. If hosted payment and payout features are added, this page will explain how they work.",
      },
      {
        term: "Report a problem",
        short: "Tell Bluebird about a listing issue",
        body: "Use Contact us or report the listing when content appears unsafe, prohibited, fraudulent or otherwise violates the published policies. Bluebird does not process payment or hold funds through the marketplace.",
      },
    ],
  },
  {
    heading: "Idaho titles and paperwork",
    terms: [
      {
        term: "Title (certificate of title)",
        short: "The legal proof of who owns a vehicle",
        body: "Issued by the Idaho Transportation Department. To sell, the owner signs it over to the buyer with the sale price. Don't buy a vehicle without one. See [how to buy a used car in Idaho](/guides/how-to-buy-a-used-car-in-idaho).",
      },
      {
        term: "Lienholder",
        short: "The lender with a claim on a vehicle",
        body: "If a vehicle was financed, the lender is listed on the title (or holds an electronic lien) until the loan is paid off. The lien has to be released before ownership can transfer to a buyer.",
      },
      {
        term: "Lien release",
        short: "The lender's sign-off that the loan is paid",
        body: "Once the loan is paid, the lender releases its interest. In Idaho, when an electronic lien is released, ITD prints the title and mails it to the owner.",
      },
      {
        term: "Bill of sale",
        short: "The written record of a sale",
        body: "Lists the vehicle, odometer reading, sale price, date, and both parties' names and addresses, signed by both. An Idaho buyer needs the original to prove the price when paying sales tax. ITD's form 3738 works.",
      },
      {
        term: "Release of liability",
        short: "The seller's notice that a vehicle was sold",
        body: "In Idaho, the seller files it with ITD within 5 days of delivering the vehicle, for $3.50, online or at a county motor vehicle office (Idaho Code 49-526). It protects the seller from tickets and towing charges after the sale. See [how to sell a car in Idaho](/guides/how-to-sell-a-car-in-idaho).",
      },
      {
        term: "Odometer disclosure",
        short: "The mileage statement at sale",
        body: "The seller records the odometer reading when the title is transferred. ITD requires it for vehicles newer than model year 2010 that weigh under 16,000 pounds.",
      },
      {
        term: "Duplicate title",
        short: "A replacement for a lost title",
        body: "Only the titled owner or the lienholder can order one. In Idaho a duplicate title costs $14.",
      },
      {
        term: "Late-filing penalty",
        short: "The fee for titling late",
        body: "An Idaho buyer has 30 days from the sale to apply for a title at a county assessor's motor vehicle office. After that, there's a $20 late-filing penalty.",
      },
      {
        term: "Sales tax on a private vehicle sale",
        short: "What the buyer pays when titling",
        body: "The buyer pays Idaho's 6% sales tax on the price paid, collected when they title the vehicle. There's no trade-in credit in a private sale.",
      },
      {
        term: "Family transfer exemption",
        short: "When a family sale isn't taxed",
        body: "A sale between a parent, child, grandparent, grandchild, brother or sister is exempt from Idaho sales tax only if the family member paid sales or use tax when they bought the vehicle (Idaho State Tax Commission form ST-133).",
      },
      {
        term: "VIN",
        short: "Vehicle Identification Number",
        body: "The 17-character code that identifies a specific vehicle. It should match on the dashboard, the driver's door jamb and the title. History reports and recall lookups use it.",
      },
      {
        term: "VIN inspection",
        short: "A check that the VIN matches the paperwork",
        body: "Required in Idaho for any vehicle not already titled in Idaho, such as one brought from another state. A DMV employee, law enforcement officer or Idaho dealer can do it.",
      },
      {
        term: "Rebuilt Salvage",
        short: "A title brand for a repaired total loss",
        body: "Means the vehicle was once declared salvage, usually a total loss, and was repaired to meet Idaho's equipment requirements. The brand appears in the title's \"Other Pertinent Data\" section and stays with the vehicle for life.",
      },
      {
        term: "Salvage certificate",
        short: "The ownership document for a salvage vehicle",
        body: "Issued after a vehicle is declared salvage. A vehicle with only a salvage certificate can't be registered in Idaho until it's repaired and an application for a title has been submitted.",
      },
      {
        term: "Registration",
        short: "Permission to use a vehicle on public roads",
        body: "Separate from the title. In Idaho, cars and trucks are registered at county motor vehicle offices, and the license plates belong to the owner rather than the vehicle; the seller keeps them when selling.",
      },
      {
        term: "Restricted-use plate",
        short: "The black-and-white plate for off-road vehicles",
        body: "Unlike car plates, Idaho's restricted-use plate on an ATV, UTV or off-road motorcycle stays with the vehicle when it's sold.",
      },
      {
        term: "Unladen weight",
        short: "A vehicle's weight with no cargo",
        body: "Idaho uses it to decide whether a utility trailer needs a title: 2,000 pounds or more unladen, it's titled; under 2,000 pounds, it's registered only (Idaho Code 49-501).",
      },
      {
        term: "Vessel title",
        short: "A title for a boat",
        body: "Required in Idaho for boats of model year 2000 or newer with a permanently attached motor or sail, and for non-exempt boats over 12 feet. Canoes, kayaks, drift boats and rafts are exempt (Idaho Code 67-7040). See [selling an RV, trailer or boat in Idaho](/guides/selling-an-rv-trailer-or-boat-in-idaho).",
      },
      {
        term: "Emissions testing",
        short: "No longer required in Idaho",
        body: "Idaho repealed its vehicle emissions testing requirement effective July 1, 2023, and the EPA approved removing the Ada County program.",
      },
      {
        term: "NMVTIS",
        short: "The national title history database",
        body: "The National Motor Vehicle Title Information System collects title brands, odometer readings and total-loss records from states and insurers. Vehicle history reports from approved providers draw on it.",
      },
    ],
  },
  {
    heading: "Vehicle listing details",
    terms: [
      {
        term: "Clean title",
        short: "A title with no brand",
        body: "Means the title carries no brand such as Rebuilt Salvage. It isn't a guarantee the vehicle has never been damaged, so a history report and an inspection are still worth it.",
      },
      {
        term: "Trim",
        short: "The version of a model",
        body: "The package or level within a model, such as TRD Off-Road or XLT. Trim affects features, engine options and price, so compare like with like.",
      },
      {
        term: "Drivetrain",
        short: "Which wheels the engine powers",
        body: "FWD (front-wheel drive), RWD (rear-wheel drive), AWD (all-wheel drive, always or automatically powering all four wheels) or 4WD (four-wheel drive, usually selectable, with low range for rough terrain).",
      },
      {
        term: "Body style",
        short: "The vehicle's shape and type",
        body: "Sedan, coupe, hatchback, wagon, SUV, crossover, pickup truck, van or convertible. Bluebird's vehicle filters use it.",
      },
      {
        term: "Recall",
        short: "A manufacturer's safety fix",
        body: "When a safety defect is found, the manufacturer issues a recall and fixes it for free at a dealer. Check any used vehicle's VIN on NHTSA's recall lookup before buying.",
      },
      {
        term: "Pre-purchase inspection",
        short: "A mechanic's check before you buy",
        body: "An independent mechanic looks the vehicle over before money changes hands. It's the best protection a used-car buyer has; a seller who refuses one is a warning sign.",
      },
    ],
  },
  {
    heading: "Homes and rentals",
    terms: [
      {
        term: "Security deposit",
        short: "Money held against damage or unpaid rent",
        body: "Under Idaho Code 6-321, a landlord must return it within 21 days after you move out unless the lease sets a different time, and never later than 30 days. A landlord can't keep any of it for normal wear and tear, and must itemize anything withheld.",
      },
      {
        term: "Normal wear and tear",
        short: "Ordinary aging of a rental",
        body: "Deterioration from normal, intended use of a rental, without negligence, carelessness, accident or abuse. Idaho landlords can't deduct it from a security deposit.",
      },
      {
        term: "Lease length",
        short: "How long a rental agreement runs",
        body: "A fixed term (often 6 or 12 months) or month-to-month. The lease sets rent, deposit, notice periods and who pays which utilities.",
      },
      {
        term: "Utilities paid by",
        short: "Who covers power, water, gas and trash",
        body: "Rental listings note which utilities are included in the rent and which the tenant pays, which can change the real monthly cost a lot.",
      },
      {
        term: "HOA fees",
        short: "Homeowners association dues",
        body: "Recurring fees some neighborhoods and condos charge owners for shared areas and services. They add to the monthly cost of owning, so check them before you compare prices.",
      },
      {
        term: "For sale by owner (FSBO)",
        short: "A home sold without a listing agent",
        body: "The owner markets and negotiates the sale directly. Buyers often still use their own agent, an attorney or a title company to handle the paperwork and closing.",
      },
      {
        term: "Rental listing scam",
        short: "A fake rental ad",
        body: "Signs include rent far below the area, an owner who can't show the place, and pressure to pay before a tour. Check property ownership in county assessor records. See [marketplace scams to watch for](/guides/marketplace-scams-to-watch-for).",
      },
    ],
  },
  {
    heading: "Jobs and pay",
    terms: [
      {
        term: "Hourly pay",
        short: "Pay per hour worked",
        body: "Idaho's minimum wage is $7.25 an hour; tipped employees can be paid $3.35 an hour directly as long as tips bring them to at least the minimum, with the employer making up any shortfall.",
      },
      {
        term: "Salary",
        short: "A fixed yearly amount",
        body: "Pay quoted per year, divided across paychecks, usually regardless of the exact hours worked in a given week.",
      },
      {
        term: "Full-time and part-time",
        short: "How many hours a job usually involves",
        body: "There's no single legal definition; employers set their own thresholds, often around 30 to 40 hours a week for full-time. Ask the employer what the schedule and benefits eligibility are.",
      },
      {
        term: "Seasonal",
        short: "Work for part of the year",
        body: "Jobs tied to a season, such as harvest, summer recreation or winter holidays, with an expected end date.",
      },
      {
        term: "Contract",
        short: "Work for a set project or period",
        body: "Contract or freelance work is often paid without tax withholding, leaving the worker to handle their own taxes. Ask whether the role is an employee position or independent contracting.",
      },
    ],
  },
  {
    heading: "Local services",
    terms: [
      {
        term: "Registered contractor",
        short: "A contractor registered with the state",
        body: "In Idaho, anyone doing a construction job over $2,000 in materials and labor must register with the Idaho Contractors Board (part of the Division of Occupational and Professional Licenses), unless exempt. Electricians, plumbers and HVAC contractors are licensed separately. Ask for the registration or license number and check it with the state.",
      },
      {
        term: "Quote",
        short: "A price for a specific job",
        body: "A provider's stated price for defined work. Get it in writing with what's included, so you can compare providers fairly.",
      },
      {
        term: "Service area",
        short: "Where a provider works",
        body: "The cities or counties a service provider covers. Some charge a trip fee outside their usual area.",
      },
    ],
  },
];

export const glossarySources = [
  {
    label: "Idaho Transportation Department: Vehicle Titles",
    url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-titles/",
  },
  {
    label: "Idaho Transportation Department: Salvage Vehicles",
    url: "https://itd.idaho.gov/dmv/registrations-plates-titles/salvage-vehicles/",
  },
  {
    label: "Idaho Code § 49-501, § 49-526, § 67-7040 and § 6-321",
    url: "https://legislature.idaho.gov/statutesrules/idstat/",
  },
  {
    label: "Idaho State Tax Commission: Motor vehicle sales between individuals",
    url: "https://tax.idaho.gov/taxes/sales-use/transportation/motor-vehicles/nondealers/types-of-sales/",
  },
  {
    label: "Idaho DEQ: Vehicle Emissions",
    url: "https://www.deq.idaho.gov/air-quality/improving-air-quality/vehicle-emissions/",
  },
  {
    label: "Idaho Department of Labor: Labor law FAQ (minimum wage)",
    url: "https://www.labor.idaho.gov/businesses/labor-laws/labor-laws-faq/",
  },
  {
    label: "Idaho Contractors Board: FAQ",
    url: "https://dopl.idaho.gov/con/con-faq/",
  },
];

export function glossaryAnchor(term: string) {
  return term
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

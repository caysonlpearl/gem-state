/**
 * Idaho buying and selling guides. Every legal step, fee and deadline cites an
 * official source in `sources`, with the date it was last checked in
 * `reviewed`; re-check them at least yearly (fees and forms change).
 *
 * Inline links use [label](/path) and are rendered by GuideArticle.
 */

export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "note"; text: string };

export type Guide = {
  slug: string;
  title: string;
  /** Meta description and listing-card summary. */
  description: string;
  /** One paragraph that answers the question outright. */
  answer: string;
  published: string;
  reviewed: string;
  sections: { heading: string; blocks: GuideBlock[] }[];
  faqs: { question: string; answer: string }[];
  sources: { label: string; url: string }[];
  related: { label: string; path: string }[];
  /** Category landing pages that link to this guide. */
  categories: string[];
};

export const guides: Guide[] = [
  {
    slug: "how-to-sell-a-car-in-idaho",
    title: "How to sell a car in Idaho: title, release of liability and plates",
    description:
      "Selling a car privately in Idaho, step by step: signing the title, the bill of sale, keeping your plates, and filing the $3.50 release of liability within 5 days.",
    answer:
      "To sell a car privately in Idaho, sign the title over to the buyer and write in the real sale price, fill out a bill of sale that you both sign, take your license plates off, and file a release of liability with the Idaho Transportation Department within 5 days of handing over the car. The release costs $3.50 and can be filed online. The buyer then has 30 days to title the car at a county DMV office and pays Idaho's 6% sales tax when they do.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "Before you list it",
        blocks: [
          {
            kind: "p",
            text: "The car has to be titled in your name before you can sell it. If you bought it and never transferred the title, title it first: selling a car that isn't titled to you is on ITD's own list of the most common title mistakes, and the buyer won't be able to register it.",
          },
          {
            kind: "list",
            items: [
              "**Find the title.** If it's lost, only the titled owner (or the lienholder) can order a duplicate. A duplicate costs $14, and ITD offers a \"duplicate with transfer\" for odometer-exempt vehicles when you're selling at the same time.",
              "**If you still owe money on it,** the lender holds the title or an electronic lien. Ask your lender how they handle a private sale: usually you pay off the balance, the lien is released, and then the title can be signed over.",
              "**Gather what buyers ask for:** maintenance records, the number of keys, and the VIN. Many buyers will run a vehicle history report; running one yourself first means no surprises.",
            ],
          },
        ],
      },
      {
        heading: "Pricing and listing",
        blocks: [
          {
            kind: "p",
            text: "Price it against what the same make, model, year and mileage is actually listed for near you, not just a national guide. You can compare against current [cars and trucks for sale in Idaho](/idaho/cars-trucks) on Bluebird, and against a pricing guide such as Kelley Blue Book or J.D. Power (NADA) for private-party value.",
          },
          {
            kind: "list",
            items: [
              "Take photos in daylight: all four sides, the interior, the odometer, the engine bay and any damage. Honest photos of flaws save wasted trips.",
              "Put the year, make, model, trim and mileage in the title of the listing, and the title status (clean, rebuilt, salvage) in the description.",
              "Including the VIN lets serious buyers check the history before they contact you.",
            ],
          },
          {
            kind: "p",
            text: "When you're ready, you can [post your car on Bluebird](/sell). Buyers contact you directly; Bluebird doesn't take a cut of the sale.",
          },
        ],
      },
      {
        heading: "Showing the car and test drives",
        blocks: [
          {
            kind: "list",
            items: [
              "Meet in a busy public place in daylight. Many Idaho police departments have a lobby or parking lot buyers and sellers can use; call the non-emergency line of your local department to ask.",
              "Bring someone with you, and tell someone else where you're going.",
              "Before a test drive, look at the buyer's driver's license and take a photo of it. Ride along, and keep the keys and title with you when the buyer isn't driving.",
            ],
          },
        ],
      },
      {
        heading: "Getting paid safely",
        blocks: [
          {
            kind: "p",
            text: "Don't sign the title or hand over keys until the money is actually yours.",
          },
          {
            kind: "list",
            items: [
              "**Cash:** meet at your bank, have the teller count and check the bills, and deposit them on the spot.",
              "**Cashier's check:** call the issuing bank using a phone number you look up yourself, not the one printed on the check, and confirm it's real before you hand anything over. Better yet, go to the buyer's bank together.",
              "**Walk away from overpayment.** A buyer who sends more than the price and asks for the difference back is running a scam. So is anyone who wants to pay from out of state and send a shipper. See the [Bluebird safety center](/safety) for other common scams.",
            ],
          },
        ],
      },
      {
        heading: "The paperwork at the sale",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Sign the title over to the buyer.** Fill in the buyer's name and the date, and sign where the seller signs. Write the actual price you're being paid: Idaho law makes it a felony to put a false selling price on a title or bill of sale.",
              "**Record the odometer reading** if the title asks for it. ITD requires an odometer disclosure for vehicles newer than model year 2010 that weigh under 16,000 pounds.",
              "**Fill out a bill of sale and both sign it.** ITD's Bill of Sale form (ITD 3738) asks for the vehicle details, the odometer reading, the selling price, the date and both parties' names and addresses. Make a copy for each of you. The buyer needs the original to prove the price when they pay sales tax; the Idaho State Tax Commission won't accept a canceled check instead.",
              "**Write down the buyer's full name, address and driver's license number.** You'll need them for the release of liability.",
            ],
          },
        ],
      },
      {
        heading: "After the sale: plates and the release of liability",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Take your license plates off.** In Idaho the plates belong to you, not the car. You can move them to another vehicle you own once it's registered, and keep credit for the registration time left on them. (The one exception is the black-and-white restricted plate on an ATV, UTV or off-road motorcycle, which stays with the vehicle.)",
              "**File a release of liability within 5 days of handing over the car.** It's required by Idaho Code 49-526, costs $3.50, and can be filed online at the [Idaho DMV online services site](https://dmvonline.itd.idaho.gov/) without an account, or on paper (form ITD 3858) at your county assessor's motor vehicle office. You'll need the VIN, the odometer reading, the sale price, the date and the buyer's name, address and driver's license number.",
              "**Call your insurance company** to take the car off your policy once the buyer has it.",
            ],
          },
          {
            kind: "note",
            text: "The release of liability is what protects you if the buyer racks up tickets or the car gets towed before they title it. Under Idaho Code 49-526, once it's filed you aren't liable for violations, towing, storage, repair or service charges that happen after you delivered the car, and ITD notes it may also protect you from liability for a crash involving the car after that date.",
          },
        ],
      },
      {
        heading: "What the buyer takes care of",
        blocks: [
          {
            kind: "list",
            items: [
              "**Titling within 30 days.** The buyer applies for a new title at a county assessor's motor vehicle office within 30 days of the sale, or pays a $20 late-filing penalty.",
              "**Fees:** the state title fee is $14, plus a county administrative fee that varies by county.",
              "**Sales tax:** the buyer pays Idaho's 6% sales tax on the price paid, collected when they title the car. There's no trade-in credit in a private sale.",
              "**Family sales:** buying from a parent, child, grandparent, grandchild, brother or sister is exempt from sales tax only if that family member paid sales or use tax when they bought it (Tax Commission form ST-133).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Do the license plates stay with the car when you sell it in Idaho?",
        answer:
          "No. In Idaho the plates belong to the seller. Take them off when you sell the car; you can move them to another vehicle you own once it's registered and keep credit for the remaining registration time.",
      },
      {
        question: "How long do I have to file a release of liability in Idaho?",
        answer:
          "Five days from the day you deliver the car to the buyer. It costs $3.50 and can be filed online through the Idaho DMV's online services or on form ITD 3858 at a county DMV office.",
      },
      {
        question: "Who pays sales tax on a private car sale in Idaho?",
        answer:
          "The buyer. They pay 6% of the price paid when they apply for the title at a county assessor's motor vehicle office.",
      },
      {
        question: "Do I need a bill of sale to sell a car in Idaho?",
        answer:
          "Yes, in practice. The buyer has to show an original bill of sale signed by both of you to prove the price when paying sales tax, so fill one out (ITD form 3738 works) and keep a copy.",
      },
      {
        question: "How long does the buyer have to title the car?",
        answer:
          "Thirty days from the sale. After that, the county charges a $20 late-filing penalty.",
      },
    ],
    sources: [
      {
        label:
          "Idaho Transportation Department: Vehicle Titles (fees, deadlines, odometer disclosure)",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-titles/",
      },
      {
        label: "Idaho Code § 49-526: Release of liability upon sale of vehicle",
        url: "https://legislature.idaho.gov/statutesrules/idstat/title49/t49ch5/sect49-526/",
      },
      {
        label: "ITD 3858: Notice of Release of Liability",
        url: "https://itd.idaho.gov/wp-content/uploads/2025/03/3858.pdf",
      },
      {
        label: "ITD 3738: Bill of Sale",
        url: "https://itd.idaho.gov/wp-content/uploads/2025/03/3738.pdf",
      },
      {
        label: "Idaho DMV online services (file a release of liability)",
        url: "https://dmvonline.itd.idaho.gov/",
      },
      {
        label:
          "ITD: Avoid the problems, never buy a vehicle without a title (plates, release, false prices)",
        url: "https://apps.itd.idaho.gov/apps/MediaManagerMVC/transporter/2014/030714_Trans/030714_TitleMistakes.html",
      },
      {
        label: "Idaho State Tax Commission: Motor vehicle sales between individuals",
        url: "https://tax.idaho.gov/taxes/sales-use/transportation/motor-vehicles/nondealers/types-of-sales/",
      },
    ],
    related: [
      { label: "Cars and trucks for sale in Idaho", path: "/idaho/cars-trucks" },
      { label: "Post a listing on Bluebird", path: "/sell" },
      { label: "Spotting marketplace scams", path: "/safety" },
    ],
    categories: ["cars-trucks", "motorcycles", "rvs-campers", "powersports", "trailers"],
  },
];

export function guidesForCategory(categorySlug: string | undefined) {
  return categorySlug ? guides.filter((guide) => guide.categories.includes(categorySlug)) : [];
}

export function guideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug) ?? null;
}

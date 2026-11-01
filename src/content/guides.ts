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
  {
    slug: "safe-places-to-meet-for-a-local-sale-in-idaho",
    title: "Safe places to meet for a local sale in Idaho",
    description:
      "Where to meet a buyer or seller in Idaho, which police departments have offered exchange spots, and how to handle cash, big items and test drives safely.",
    answer:
      "Meet in a busy, well-lit public place during the day, ideally a police department's lobby or parking lot where cameras are running, or a bank lobby if cash is changing hands. Meridian and Nampa police both announced exchange spots at their stations in 2016, but neither city's police page mentions them today, so call the department's non-emergency line before you go. Bring someone with you, and don't invite strangers to your home for anything you can carry.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "Pick the right spot",
        blocks: [
          {
            kind: "list",
            items: [
              "**A police department lobby or parking lot.** Cameras, lighting and officers coming and going make it the least attractive place for anyone planning a scam or a robbery.",
              "**A bank lobby during business hours** when real money changes hands. A teller can count and check cash, and you can deposit it on the spot.",
              "**The entrance of a busy store** for small, low-value items.",
              "**Avoid** empty parking lots, meeting after dark, and anywhere the other person picks at the last minute. If someone refuses to meet in a public place, walk away.",
            ],
          },
        ],
      },
      {
        heading: "Exchange spots Idaho police have announced",
        blocks: [
          {
            kind: "list",
            items: [
              "**Meridian Police Department** announced a safe internet purchase and exchange spot in its parking lot in April 2016, with 24-hour video surveillance. The department's administration building is at 1401 E. Watertower St.",
              "**Nampa Police Department** set aside two parking spaces in its station's front lot for online-sale exchanges in 2016, also under 24-hour video surveillance, and recommended meeting during the day.",
            ],
          },
          {
            kind: "note",
            text: "We couldn't find either program on the cities' current police pages, and we couldn't find an official exchange spot for any other Idaho city. Programs change, so call ahead. If your city isn't listed, ask anyway: many departments will tell you whether you're welcome to meet in their lobby or lot.",
          },
        ],
      },
      {
        heading: "Find your local police department",
        blocks: [
          {
            kind: "p",
            text: "Call the non-emergency number on your department's site (not 911) to ask about meeting there. Eagle and Kuna are policed by the Ada County Sheriff's Office under contract; Hayden is covered by the Kootenai County Sheriff's Office and Ammon by the Bonneville County Sheriff's Office.",
          },
          {
            kind: "list",
            items: [
              "Treasure Valley: [Boise](https://www.cityofboise.org/departments/police/), [Meridian](https://meridiancity.org/police/), [Nampa](https://www.cityofnampa.us/1451/Police), [Caldwell](https://www.cityofcaldwell.org/Departments/Police), [Eagle](https://www.cityofeagle.org/444/Eagle-Police), [Kuna](https://kunacity.id.gov/654/Kuna-City-Police-Department), [Ada County Sheriff](https://adacounty.id.gov/sheriff/), [Canyon County Sheriff](https://www.canyoncounty.id.gov/elected-officials/sheriff/), [Mountain Home](https://www.mountain-home.us/170/Police-Department)",
              "Eastern Idaho: [Idaho Falls](https://www.idahofallsidaho.gov/1739/Police-Department), [Ammon (Bonneville County Sheriff)](https://www.bonnevillecountyidaho.gov/administration/sheriff), [Pocatello](https://pocatello.gov/370/Police), [Chubbuck](https://cityofchubbuck.us/police_dept/), [Rexburg](https://www.rexburg.org/o/police), [Blackfoot](http://blackfootpolice.org/)",
              "Magic Valley: [Twin Falls](https://www.tfid.org/186/Police), [Jerome](https://www.ci.jerome.id.us/175/Police-Department)",
              "North Idaho: [Coeur d'Alene](https://www.cdaid.org/police), [Post Falls](https://www.postfallspolice.gov/), [Hayden (Kootenai County Sheriff)](https://www.kcsheriff.com/), [Lewiston](https://www.cityoflewiston.org/292/Police-Department), [Moscow](https://www.ci.moscow.id.us/234/Police)",
            ],
          },
        ],
      },
      {
        heading: "When the item is too big to bring",
        blocks: [
          {
            kind: "list",
            items: [
              "Move furniture or appliances into the garage or driveway before the buyer arrives, so nobody needs to walk through your home.",
              "Have another adult there, and let someone else know when the buyer is coming.",
              "Keep valuables, mail and anything with your address or schedule out of sight.",
              "Send extra photos or a video instead of offering an in-person look before someone has committed to buy.",
            ],
          },
        ],
      },
      {
        heading: "Vehicles, test drives and payment",
        blocks: [
          {
            kind: "list",
            items: [
              "Before a test drive, look at the driver's license, take a photo of it and ride along. Keep the keys and title with you when the buyer isn't driving. The full process is in [how to sell a car in Idaho](/guides/how-to-sell-a-car-in-idaho).",
              "Count cash at a bank. Never take a check for more than the price, and never send money back to a buyer who says they overpaid.",
              "Don't accept payment-app payments from strangers, and never share a verification code sent to your phone. More in [marketplace scams to watch for](/guides/marketplace-scams-to-watch-for).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Does Boise have a police safe exchange zone?",
        answer:
          "We couldn't find an official exchange spot listed by the Boise Police Department as of October 2026. Call its non-emergency line to ask whether you can meet in its lobby or lot, or meet in a bank lobby during business hours.",
      },
      {
        question: "Is the Meridian police exchange zone still open?",
        answer:
          "Meridian police announced the spot in their parking lot in 2016, but it isn't mentioned on the department's current website. Call the department before you rely on it.",
      },
      {
        question: "Should I let a buyer come to my house?",
        answer:
          "For anything you can carry, no: meet in public. For furniture and appliances, move the item to your garage or driveway, have another adult home, and keep the visit short.",
      },
    ],
    sources: [
      {
        label:
          "Idaho News 6: Meridian Police Dept. offers safe online purchase and exchange zone (April 2016)",
        url: "https://idahonews.com/news/local/meridian-police-dept-offers-safe-online-purchase-and-exchange-zone",
      },
      {
        label: "KIVI: Nampa PD unveils Craigslist safe zone at station (2016)",
        url: "https://www.kivitv.com/news/nampa-pd-unveils-craigslist-safe-zone-purchase-area",
      },
      {
        label: "Idaho State Police: Idaho law enforcement agencies",
        url: "https://isp.idaho.gov/citizen-resources/idaho-le-agencies/",
      },
      {
        label: "City of Eagle: Eagle Police (Ada County Sheriff contract)",
        url: "https://www.cityofeagle.org/444/Eagle-Police",
      },
      {
        label: "FTC: Selling stuff online? Here's how to avoid a scam",
        url: "https://consumer.ftc.gov/consumer-alerts/2022/07/selling-stuff-online-heres-how-avoid-scam",
      },
    ],
    related: [
      { label: "How to sell a car in Idaho", path: "/guides/how-to-sell-a-car-in-idaho" },
      { label: "Marketplace scams to watch for", path: "/guides/marketplace-scams-to-watch-for" },
      { label: "Browse listings near you", path: "/browse" },
    ],
    categories: [
      "furniture",
      "electronics",
      "tools-equipment",
      "home-garden",
      "outdoor-sporting",
      "musical-instruments",
      "collectibles",
      "general",
    ],
  },
  {
    slug: "how-to-buy-a-used-car-in-idaho",
    title: "How to buy a used car in Idaho without getting burned",
    description:
      "Buying a used car from a private seller in Idaho: checking the title and brands, running the VIN, paying safely, and titling it within 30 days with the 6% sales tax.",
    answer:
      "Before you pay for a used car in Idaho, see the paper title and make sure the seller's name is on it, check the title and a vehicle history report for brands like Rebuilt Salvage, look up open recalls by VIN, and have a mechanic inspect it. At the sale, get the signed title and a bill of sale with the real price. You then have 30 days to title it at a county assessor's motor vehicle office, where you pay 6% sales tax on the price, a $14 title fee and a county fee. Idaho no longer requires emissions testing.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "Check the title before anything else",
        blocks: [
          {
            kind: "list",
            items: [
              "**No title, no deal.** The Idaho Transportation Department's advice is simply not to buy a vehicle without one. Without it you may not be able to title or register the car in your name.",
              "**The seller's name has to be on it.** Check it against their ID. A seller who isn't the titled owner (or a legally appointed agent) can't transfer it.",
              '**Be wary of "I lost the title."** Only the titled owner or the lienholder can get a duplicate, so the seller can order one before the sale.',
              "**Look for a lienholder.** If a lender is listed, the lien has to be released before the title can be transferred to you.",
              '**Read the brands.** Idaho prints brands such as Rebuilt Salvage in the title\'s "Other Pertinent Data" section, and the brand stays with the vehicle for life. A rebuilt salvage car was once declared a total loss, which usually means a lower value.',
            ],
          },
        ],
      },
      {
        heading: "Run the VIN",
        blocks: [
          {
            kind: "list",
            items: [
              "Match the VIN on the dashboard, the driver's door jamb and the title. A mismatch is a reason to walk away.",
              "Get a history report from a provider approved by the federal [National Motor Vehicle Title Information System](https://vehiclehistory.bja.ojp.gov/), which collects title brands, odometer readings and total-loss records from states and insurers.",
              "Check for open safety recalls by VIN on [NHTSA's recall lookup](https://www.nhtsa.gov/recalls). Recall repairs are free at a dealer.",
            ],
          },
        ],
      },
      {
        heading: "Inspect it and test drive it",
        blocks: [
          {
            kind: "list",
            items: [
              "Pay an independent mechanic for a pre-purchase inspection. It's the best money you'll spend, and a seller who won't allow one is telling you something.",
              "Start the car cold if you can, and drive it at highway speed, over rough pavement and through some stop-and-go.",
              "Meet somewhere public. See [safe places to meet in Idaho](/guides/safe-places-to-meet-for-a-local-sale-in-idaho).",
            ],
          },
        ],
      },
      {
        heading: "Paying safely",
        blocks: [
          {
            kind: "list",
            items: [
              "Don't send a deposit for a car you haven't seen in person, and never pay with gift cards, wire transfers or cryptocurrency: those are signs of a scam.",
              "Pay with a cashier's check made out to the titled owner, or do the deal at your bank so the seller can see the money is real.",
              "If the price is far below similar cars, the seller is in a hurry and can't meet in person, assume it's a fake listing. Compare against [cars and trucks for sale in Idaho](/idaho/cars-trucks).",
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
              "**Get the title signed over to you,** with the real sale price and the odometer reading (required for vehicles newer than model year 2010 that weigh under 16,000 pounds).",
              "**Get a bill of sale signed by both of you.** You'll need the original to prove the price when you pay sales tax; the Idaho State Tax Commission won't accept a canceled check instead. ITD's form 3738 works.",
              "**Plan how you'll get it home.** In Idaho the seller keeps the license plates, so the car won't have plates when you buy it. Ask your county motor vehicle office about registering it before you drive it on public roads.",
            ],
          },
        ],
      },
      {
        heading: "Titling it in your name",
        blocks: [
          {
            kind: "list",
            items: [
              "**Deadline:** apply for the title at a county assessor's motor vehicle office within 30 days of the sale, or pay a $20 late-filing penalty.",
              "**Fees:** the state title fee is $14, plus a county administrative fee that varies by county.",
              "**Sales tax:** 6% of the price you paid, collected when you title it. A sale between a parent, child, grandparent, grandchild, brother or sister is exempt only if the family member paid sales tax when they bought it (form ST-133).",
              "**Out-of-state title?** A vehicle that has never been titled in Idaho needs a VIN inspection, done by the DMV, a law enforcement officer or an Idaho dealer.",
              "**Emissions testing:** not required. Idaho repealed vehicle emissions testing effective July 1, 2023, and the EPA approved removing the Ada County program.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Can I buy a car without a title in Idaho?",
        answer:
          "Don't. The Idaho Transportation Department warns against it: without a properly signed title you may not be able to title or register the car. If the seller lost it, they can order a duplicate first.",
      },
      {
        question: "How long do I have to title a car after buying it in Idaho?",
        answer:
          "Thirty days from the sale. After that, the county charges a $20 late-filing penalty.",
      },
      {
        question: "Does Idaho require emissions testing?",
        answer:
          "No. Idaho repealed its vehicle emissions testing requirement effective July 1, 2023, and the EPA approved removing the Ada County program that year.",
      },
      {
        question: "What does Rebuilt Salvage mean on an Idaho title?",
        answer:
          "The vehicle was once declared salvage (usually a total loss) and was later repaired to meet Idaho's equipment requirements. The brand stays on the title for the life of the vehicle.",
      },
    ],
    sources: [
      {
        label: "Idaho Transportation Department: Vehicle Titles",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-titles/",
      },
      {
        label: "Idaho Transportation Department: Salvage Vehicles",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/salvage-vehicles/",
      },
      {
        label: "ITD: Avoid the problems, never buy a vehicle without a title",
        url: "https://apps.itd.idaho.gov/apps/MediaManagerMVC/transporter/2014/030714_Trans/030714_TitleMistakes.html",
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
        label: "National Motor Vehicle Title Information System (U.S. Department of Justice)",
        url: "https://vehiclehistory.bja.ojp.gov/",
      },
      { label: "NHTSA: Safety recalls by VIN", url: "https://www.nhtsa.gov/recalls" },
    ],
    related: [
      { label: "Cars and trucks for sale in Idaho", path: "/idaho/cars-trucks" },
      { label: "How to sell a car in Idaho", path: "/guides/how-to-sell-a-car-in-idaho" },
      { label: "Marketplace scams to watch for", path: "/guides/marketplace-scams-to-watch-for" },
    ],
    categories: ["cars-trucks", "motorcycles", "powersports"],
  },
  {
    slug: "selling-an-rv-trailer-or-boat-in-idaho",
    title: "Selling an RV, trailer or boat in Idaho: titles and registration",
    description:
      "Which RVs, trailers and boats need a title in Idaho, who registers them (ITD or Idaho Parks and Recreation), and what the buyer pays.",
    answer:
      "Motorhomes, travel trailers, fifth wheels and most trailers are titled through the Idaho Transportation Department, so you sell them like a car: sign the title over with the real price and fill out a bill of sale. The exception is a utility trailer that weighs under 2,000 pounds empty, which is registered but not titled. Boats are registered through Idaho Parks and Recreation, and a boat needs a title only if it's model year 2000 or newer and has a permanently attached motor or sail, or is longer than 12 feet; canoes, kayaks, drift boats and rafts are exempt.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "Which ones need a title",
        blocks: [
          {
            kind: "list",
            items: [
              "**Motorhomes, travel trailers and fifth wheels:** titled, like cars.",
              "**Utility trailers:** titled if they weigh 2,000 pounds or more unladen (empty). Under 2,000 pounds they're exempt from titling under Idaho Code 49-501 and are registered only.",
              "**Truck campers:** titling is optional for campers acquired before January 1, 2009.",
              "**ATVs, UTVs, motorbikes and snowmobiles:** titled unless the engine is under 50cc.",
              "**Boats:** see the boat section below.",
            ],
          },
        ],
      },
      {
        heading: "Selling a titled RV or trailer",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Sign the title over** with the buyer's name, the date and the real sale price. Idaho law makes it a felony to put a false price on a title or bill of sale.",
              "**Fill out a bill of sale** that you both sign, and keep a copy. The buyer needs the original to prove the price for sales tax.",
              "**For a motorhome, file a release of liability** within 5 days ($3.50, online at the [Idaho DMV online services site](https://dmvonline.itd.idaho.gov/) or at a county DMV office), exactly as for a car. For trailers, ask your county office whether one applies.",
              "**The buyer titles it within 30 days** at a county assessor's motor vehicle office ($14 title fee plus a county fee, or a $20 late penalty after 30 days) and pays 6% sales tax on the price.",
            ],
          },
        ],
      },
      {
        heading: "Selling a small utility trailer (under 2,000 pounds)",
        blocks: [
          {
            kind: "p",
            text: "With no title, the bill of sale is the buyer's proof of ownership, so make it complete: the trailer's VIN or serial number, its empty weight, the price, the date, and both of your names, addresses and signatures. Give the buyer the current registration too. The buyer registers it at a county office: $5 a year, $20 for five years or $30 for ten.",
          },
        ],
      },
      {
        heading: "What an RV buyer pays to register it",
        blocks: [
          {
            kind: "p",
            text: "Idaho charges RV fees based on market value: $8.50 for the first $1,000 of value plus $5 for each additional $1,000. Camp trailers, tent trailers and fifth wheels also pay a $4 registration fee, and every RV registration expires December 31. Telling a buyer this up front avoids surprises at the DMV counter.",
          },
        ],
      },
      {
        heading: "Selling a boat",
        blocks: [
          {
            kind: "list",
            items: [
              "**Title:** required for a boat that's model year 2000 or newer with a permanently attached means of propulsion (an inboard or inboard/outboard motor, a sail, a personal watercraft) and for any non-exempt boat over 12 feet. Drift boats, canoes, kayaks, inflatables, rafts, paddle boats and documented vessels are exempt (Idaho Code 67-7040). Older boats can be titled optionally. Titled boats transfer through the county DMV just like a car.",
              "**Registration:** boats, ATVs, UTVs, motorbikes and snowmobiles are registered through [Idaho Parks and Recreation](https://parksandrecreation.idaho.gov/registration-permits/), not the DMV: online, by phone at 1-888-922-6743, or at one of more than 200 vendors around the state. The buyer registers in their own name; the emailed receipt works as temporary proof for 60 days.",
              "**Trailer included?** A boat trailer is a separate vehicle with its own title or registration. List both in the bill of sale.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Does a utility trailer need a title in Idaho?",
        answer:
          "Only if it weighs 2,000 pounds or more empty. Utility trailers under 2,000 pounds are exempt from titling (Idaho Code 49-501) and are registered only: $5 a year, $20 for five years or $30 for ten.",
      },
      {
        question: "Where do I register a boat in Idaho?",
        answer:
          "Through Idaho Parks and Recreation, not the DMV: online, by phone at 1-888-922-6743, or at a registration vendor. Titles for boats that need one are handled by the county DMV.",
      },
      {
        question: "Do kayaks and canoes need a title in Idaho?",
        answer:
          "No. Canoes, kayaks, drift boats, inflatables, rafts and other non-motorized paddle vessels are exempt from Idaho's vessel titling act.",
      },
      {
        question: "How are RV registration fees calculated in Idaho?",
        answer:
          "On market value: $8.50 for the first $1,000 plus $5 for each additional $1,000. Camp trailers, tent trailers and fifth wheels add a $4 registration fee, and all RV registrations expire December 31.",
      },
    ],
    sources: [
      {
        label: "Idaho Code § 49-501: Titling requirements and exemptions",
        url: "https://legislature.idaho.gov/statutesrules/idstat/title49/t49ch5/sect49-501/",
      },
      {
        label: "Idaho Code § 67-7040: Vessel titling, application to certain vessels",
        url: "https://legislature.idaho.gov/statutesrules/idstat/Title67/T67CH70/SECT67-7040/",
      },
      {
        label: "Idaho Transportation Department: Vehicle Registrations (trailer and RV fees)",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-registrations/",
      },
      {
        label: "Idaho Transportation Department: Vehicle Titles",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-titles/",
      },
      {
        label: "Idaho Parks and Recreation: Registration and permits",
        url: "https://parksandrecreation.idaho.gov/registration-permits/",
      },
      {
        label: "Idaho Code § 49-526: Release of liability upon sale of vehicle",
        url: "https://legislature.idaho.gov/statutesrules/idstat/title49/t49ch5/sect49-526/",
      },
    ],
    related: [
      { label: "RVs and campers for sale in Idaho", path: "/idaho/rvs-campers" },
      { label: "Trailers for sale in Idaho", path: "/idaho/trailers" },
      { label: "How to sell a car in Idaho", path: "/guides/how-to-sell-a-car-in-idaho" },
    ],
    categories: ["rvs-campers", "trailers", "powersports", "outdoor-sporting"],
  },
  {
    slug: "marketplace-scams-to-watch-for",
    title: "Marketplace scams to watch for in Idaho, and what to do if you're hit",
    description:
      "The overpayment, fake payment, verification code, fake car and rental scams aimed at local buyers and sellers, how to spot them, and where Idahoans report them.",
    answer:
      "The scams that hit local sellers most are overpayment checks (a buyer \"accidentally\" sends too much and wants the difference back), fake payment-app notifications, and requests for a verification code sent to your phone. Buyers mostly run into listings for things the seller doesn't own: cheap cars the seller can't show, and rentals you can't tour before paying. Deal locally and in person, never send money back to anyone, and never pay with gift cards, wire transfers or crypto. If it happens, report it to the FTC at ReportFraud.ftc.gov and to the Idaho Attorney General's consumer protection division.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "Scams aimed at sellers",
        blocks: [
          {
            kind: "list",
            items: [
              "**The overpayment check.** A buyer who can't come see the item sends a check for more than the price, then asks you to send back the difference. The money may even show up in your account, but it can take the bank weeks to discover the check is fake, and then the bank takes it back. Never deposit a check for more than the price, and never send money back.",
              "**The fake payment notification.** The buyer \"pays\" through a payment app and sends a convincing but fake confirmation, or claims they paid twice and asks for a refund. Don't accept payment-app payments from people you don't know, and check your actual account, not an email or text.",
              "**The verification code.** A buyer asks you to read back a code sent to your phone \"to prove you're real.\" It's usually a code to set up a phone number (such as Google Voice) in your name. Never share a verification code.",
              "**The shipping story.** A buyer who's out of town, sending a courier, and paying extra for your trouble is almost always a scammer. Sell locally to people you can meet.",
            ],
          },
        ],
      },
      {
        heading: "Scams aimed at buyers",
        blocks: [
          {
            kind: "list",
            items: [
              "**The too-cheap car.** A low price, a seller who's in a hurry and can't meet or let you inspect the car, a VIN that doesn't match, a request for a deposit, or new \"shipping\" fees after you pay. See [how to buy a used car in Idaho](/guides/how-to-buy-a-used-car-in-idaho).",
              "**The rental you can't see.** Rent far below the area, an owner who's \"out of the country\", pressure to pay a deposit or application fee before a tour, and requests for your Social Security number up front. Look up who owns the property in your county assessor's records and make sure the name matches the person you're dealing with.",
              "**The payment method.** Nobody legitimate insists on gift cards, wire transfers or cryptocurrency. If that's the only way they'll take money, it's a scam.",
            ],
          },
        ],
      },
      {
        heading: "Red flags in one list",
        blocks: [
          {
            kind: "list",
            items: [
              "They won't meet in person, or won't let you see the item.",
              "They're in a hurry, or the price is far below similar listings.",
              'They want to move the conversation off the site right away, or send a link to "confirm" something.',
              "They want a code from your phone, your personal information, or payment in gift cards, wire transfers or crypto.",
              "The story keeps changing: a relative is picking it up, a shipper is coming, the check is from their employer.",
            ],
          },
        ],
      },
      {
        heading: "If you've been scammed",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Call your bank or card issuer right away** and ask them to stop or reverse the payment. If you paid with a gift card, contact the card's company immediately.",
              "**Report it to the FTC** at [ReportFraud.ftc.gov](https://reportfraud.ftc.gov/).",
              "**Report it to the Idaho Attorney General's Consumer Protection Division** using its [online complaint form](https://www.ag.idaho.gov/consumer-protection/consumer-complaints/), or call 208-334-2424 (toll-free: 800-432-3545).",
              "**Report the listing or the account** to the site where you found it. On Bluebird, use the report option on the listing; see the [Bluebird safety center](/safety).",
              "**If you were threatened or met someone in person,** call your local police.",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Is it a scam if a buyer sends a check for more than my asking price?",
        answer:
          "Yes. The overpayment is the scam: the check bounces after you've sent the \"extra\" back, and the bank takes the money out of your account. Don't deposit it, and don't send anything back.",
      },
      {
        question: "Why does a buyer want the code that was texted to me?",
        answer:
          "Usually to set up a phone number, such as a Google Voice number, tied to your phone so they can run other scams under it. Never share a verification code with someone you don't know.",
      },
      {
        question: "Where do I report a marketplace scam in Idaho?",
        answer:
          "To the FTC at ReportFraud.ftc.gov and to the Idaho Attorney General's Consumer Protection Division (208-334-2424, or toll-free 800-432-3545). Also call your bank right away and report the listing to the site.",
      },
    ],
    sources: [
      {
        label: "FTC: Fake check scam targets online car sellers (February 2025)",
        url: "https://consumer.ftc.gov/consumer-alerts/2025/02/fake-check-scam-targets-online-car-sellers",
      },
      {
        label: "FTC: Selling stuff online? Here's how to avoid a scam (July 2022)",
        url: "https://consumer.ftc.gov/consumer-alerts/2022/07/selling-stuff-online-heres-how-avoid-scam",
      },
      {
        label: "FTC: Avoiding rental listing scams (July 2024)",
        url: "https://consumer.ftc.gov/consumer-alerts/2024/07/avoiding-rental-listing-scams",
      },
      { label: "FTC: ReportFraud.ftc.gov", url: "https://reportfraud.ftc.gov/" },
      {
        label: "Idaho Office of the Attorney General: Report Scams Idaho",
        url: "https://www.ag.idaho.gov/consumer-protection/report-scams-idaho/",
      },
      {
        label: "Idaho Office of the Attorney General: Consumer complaints",
        url: "https://www.ag.idaho.gov/consumer-protection/consumer-complaints/",
      },
    ],
    related: [
      { label: "Bluebird safety center", path: "/safety" },
      {
        label: "Safe places to meet in Idaho",
        path: "/guides/safe-places-to-meet-for-a-local-sale-in-idaho",
      },
      { label: "Homes and rentals in Idaho", path: "/idaho/homes" },
    ],
    categories: ["other-real-estate", "electronics", "general", "tickets-events"],
  },
  {
    slug: "new-to-idaho-title-and-register-your-vehicle",
    title: "Idaho vehicle title and registration: a new-resident checklist",
    description:
      "Moving to Idaho? Check the 30-day vehicle title and registration deadline, DMV documents, VIN inspection, insurance and how to find the right county office.",
    answer:
      "If you've moved to Idaho, you have 30 days to title and register your vehicle here, even if your old state's registration hasn't expired, and 30 days to get an Idaho driver's license or ID card. Take the vehicle, its current title and registration, and your ID to a county assessor's motor vehicle office, where an employee will inspect the VIN. Fees depend on the vehicle and your county. Idaho doesn't require emissions testing.",
    published: "2026-10-13",
    reviewed: "2026-10-13",
    sections: [
      {
        heading: "The deadline",
        blocks: [
          {
            kind: "p",
            text: "The Idaho Transportation Department's guide for new residents says you must title and register your vehicle within 30 days of moving to Idaho, whether or not your out-of-state registration has expired. Some older ITD documents mention 90 days; go by the current 30-day rule.",
          },
        ],
      },
      {
        heading: "What to bring to the county motor vehicle office",
        blocks: [
          {
            kind: "list",
            items: [
              "**The vehicle itself,** for the VIN inspection (required for any vehicle not already titled in Idaho).",
              "**Its current title and registration.** If a lender holds the title, bring the lender's name and address.",
              "**Lost your title?** Apply for a duplicate from the state that issued it before your Idaho visit; ITD's new-resident guidance specifically calls this out.",
              "**Your ID.**",
              "**If the title isn't in your name,** it must be signed over to you, and you'll need a bill of sale if the price isn't on the title.",
              "**A way to pay:** confirm accepted payment methods with your county office. Fees and taxes depend on the vehicle type, its age, the purchase price and your county.",
            ],
          },
        ],
      },
      {
        heading: "Insurance and the right DMV office",
        blocks: [
          {
            kind: "p",
            text: "Tell your insurance company that you have moved to Idaho and confirm your liability coverage is with a carrier admitted in Idaho. ITD verifies coverage electronically, so changing your registration does not replace updating your insurance.",
          },
          {
            kind: "p",
            text: "Use the [Idaho DMV office finder](https://itd.idaho.gov/guide/new-to-idaho/) linked from ITD's new-resident page to check services and appointments before you go. Some county offices handle only driver's licenses, some only motor vehicles, and some both. Ask the office which fees and payment methods apply to your vehicle.",
          },
          {
            kind: "note",
            text: "The document checklist, insurance guidance and office-selection advice above were checked against ITD's New to Idaho page on November 1, 2026. If you are buying a vehicle rather than bringing one you already own, use the [used-car buying checklist](/guides/how-to-buy-a-used-car-in-idaho) for the sale and title handoff.",
          },
        ],
      },
      {
        heading: "Your Idaho driver's license",
        blocks: [
          {
            kind: "p",
            text: "You also have 30 days to get an Idaho driver's license or ID card. Bring proof of U.S. citizenship or lawful presence, identity, Idaho residency and your name; ITD recommends a second, different proof of residency too. College students attending Idaho schools and active-duty military members and their dependents can keep a valid out-of-state license.",
          },
        ],
      },
      {
        heading: "Things you don't need to worry about",
        blocks: [
          {
            kind: "list",
            items: [
              "**Emissions testing:** Idaho repealed it effective July 1, 2023, and the EPA approved removing the Ada County program.",
              "**Your old state's brands carry over:** if your vehicle has a salvage or rebuilt brand from another state, Idaho carries it forward on the new title.",
            ],
          },
        ],
      },
      {
        heading: "Boats, ATVs and snowmobiles",
        blocks: [
          {
            kind: "p",
            text: "These are registered through [Idaho Parks and Recreation](https://parksandrecreation.idaho.gov/registration-permits/), not the DMV: online, by phone at 1-888-922-6743, or through registration vendors around the state. Titles for boats and off-road vehicles that need one go through the county DMV. See [selling an RV, trailer or boat in Idaho](/guides/selling-an-rv-trailer-or-boat-in-idaho) for which ones need a title.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "How long do I have to register my car after moving to Idaho?",
        answer:
          "Thirty days, according to the Idaho Transportation Department, even if your out-of-state registration hasn't expired.",
      },
      {
        question: "Do I need a VIN inspection in Idaho?",
        answer:
          "Yes, for any vehicle that hasn't been titled in Idaho before. A DMV employee does it when you bring the vehicle to the county motor vehicle office; law enforcement officers and Idaho dealers can also do it.",
      },
      {
        question: "Does Idaho require a smog check or emissions test?",
        answer: "No. Idaho repealed vehicle emissions testing effective July 1, 2023.",
      },
    ],
    sources: [
      {
        label: "Idaho Transportation Department: New to Idaho",
        url: "https://itd.idaho.gov/guide/new-to-idaho/",
      },
      {
        label: "Idaho Transportation Department: Vehicle Titles (VIN inspection)",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/vehicle-titles/",
      },
      {
        label: "Idaho Transportation Department: Salvage Vehicles",
        url: "https://itd.idaho.gov/dmv/registrations-plates-titles/salvage-vehicles/",
      },
      {
        label: "Idaho DEQ: Vehicle Emissions",
        url: "https://www.deq.idaho.gov/air-quality/improving-air-quality/vehicle-emissions/",
      },
      {
        label: "Idaho Parks and Recreation: Registration and permits",
        url: "https://parksandrecreation.idaho.gov/registration-permits/",
      },
    ],
    related: [
      { label: "Homes and rentals in Idaho", path: "/idaho/homes" },
      { label: "How to buy a used car in Idaho", path: "/guides/how-to-buy-a-used-car-in-idaho" },
      { label: "Browse Boise classifieds", path: "/idaho/boise" },
      { label: "Furniture for sale in Idaho", path: "/idaho/furniture" },
    ],
    categories: ["cars-trucks", "other-real-estate"],
  },
  {
    slug: "moving-to-idaho-on-a-budget",
    title: "Moving to Idaho on a budget: furnishing your place secondhand",
    description:
      "How to furnish a new Idaho home for less: sell before you haul, what's worth buying used, checking recalls on dressers and cribs, where to look by city, and getting set up in your first month.",
    answer:
      "The cheapest way to furnish a new place in Idaho is to sell the heavy, bulky things before you move and buy them again secondhand once you arrive. Good used buys include solid wood furniture, bed frames, shelving, tools, bikes and outdoor gear. Look up dressers and cribs on the CPSC recall list before you buy, since recalled products can't legally be resold unless they've been fixed. And if you're selling your own things, Idaho doesn't make you collect sales tax as long as you make no more than two sales in a year.",
    published: "2026-10-14",
    reviewed: "2026-10-14",
    sections: [
      {
        heading: "Sell before you haul",
        blocks: [
          {
            kind: "p",
            text: "Moving costs are driven by weight and space, and big furniture is both. Selling a couch or dresser where you live now and buying another here often costs less than moving it, especially for pieces that are worn or won't fit the new place.",
          },
          {
            kind: "note",
            text: "Selling your own things in Idaho? The Idaho State Tax Commission's occasional sales exemption means you don't need a seller's permit or collect sales tax if you make no more than two sales in any 12 months, don't publicly present yourself as someone who sells, and hold no more than two yard sales a year. Selling a group of your own items at once counts as one sale, and there's no form to file.",
          },
        ],
      },
      {
        heading: "What's worth buying used",
        blocks: [
          {
            kind: "list",
            items: [
              "**Solid wood furniture:** dressers, tables, bookshelves and bed frames last for decades and often cost a fraction of new. Check that drawers run smoothly and joints are tight.",
              "**Tools, lawn equipment, bikes and outdoor gear:** buy used freely, but see them run or ride them first.",
              "**Appliances:** ask how old they are, see them running, and measure your space and doorways before you go.",
              "**Upholstered furniture and mattresses:** inspect seams, folds and underneath for signs of bed bugs before anything comes inside.",
            ],
          },
        ],
      },
      {
        heading: "Check for recalls before you buy",
        blocks: [
          {
            kind: "list",
            items: [
              "Search the brand and model on [CPSC's recall list](https://www.cpsc.gov/Recalls). Dressers are recalled regularly for tip-over hazards; whatever you buy, anchor tall furniture to the wall if there are kids at home.",
              "Selling a recalled product is against federal law unless the recall fix has been applied, and the listing should say so.",
              "**Cribs:** full-size cribs made before June 28, 2011 have to have proof they meet the current federal standard, and drop-side cribs in the used market can't meet it. When in doubt, buy new.",
              "Spot a recalled or unsafe product for sale? Report it at [SaferProducts.gov](https://www.saferproducts.gov/).",
            ],
          },
        ],
      },
      {
        heading: "Where to look in your city",
        blocks: [
          {
            kind: "list",
            items: [
              "Furniture: [Boise](/idaho/boise/furniture), [Meridian](/idaho/meridian/furniture), [Nampa](/idaho/nampa/furniture), [Idaho Falls](/idaho/idaho-falls/furniture), [Pocatello](/idaho/pocatello/furniture), [Twin Falls](/idaho/twin-falls/furniture), [Coeur d'Alene](/idaho/coeur-dalene/furniture), or [all of Idaho](/idaho/furniture)",
              "[Home and garden](/idaho/home-garden), [tools and equipment](/idaho/tools-equipment) and [baby and kids](/idaho/baby-kids) across Idaho",
            ],
          },
        ],
      },
      {
        heading: "Getting it home",
        blocks: [
          {
            kind: "list",
            items: [
              "Measure doorways, stairs and the spot it's going before you buy.",
              "Line up a truck or trailer and a helper ahead of time; many sellers want big items gone the same day.",
              "Tie loads down and cover anything that could blow out. A load that comes loose on the freeway is dangerous and easy to prevent.",
              "Meet somewhere safe for small items and bring someone along for pickups at a home. See [safe places to meet in Idaho](/guides/safe-places-to-meet-for-a-local-sale-in-idaho).",
            ],
          },
        ],
      },
      {
        heading: "Your first month in Idaho",
        blocks: [
          {
            kind: "list",
            items: [
              "**Electricity:** which company serves you depends on where you live. The Idaho Public Utilities Commission publishes [service area maps](https://puc.idaho.gov/Page/Standard/20) and a [list of utilities by city](https://puc.idaho.gov/Fileroom/PublicFiles/Consumer/cities.pdf). For example, Idaho Power serves Caldwell and Kuna and Avista serves Coeur d'Alene and Moscow, while some towns are served by co-ops or city utilities.",
              "**Driver's license and vehicles:** you have 30 days to get an Idaho driver's license and 30 days to title and register your vehicle. See [new to Idaho: title and register your vehicle](/guides/new-to-idaho-title-and-register-your-vehicle).",
              "**Watch for rental scams** if you're still looking for a place: rent far below the area, an owner who can't show it, and pressure to pay first. See [marketplace scams to watch for](/guides/marketplace-scams-to-watch-for).",
            ],
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Do I need a seller's permit to sell my furniture before moving out of Idaho?",
        answer:
          "Usually not. Idaho's occasional sales exemption covers people who make no more than two sales in any 12 months, don't publicly present themselves as sellers, and hold no more than two yard sales a year. Selling a group of your own things at once counts as one sale, and there's no form to file.",
      },
      {
        question: "Is it legal to sell a recalled dresser or crib?",
        answer:
          "No, not unless the recall fix has been applied. The CPSC says selling recalled products is unlawful, and full-size cribs made before June 28, 2011 need proof they meet the current federal standard.",
      },
      {
        question: "How do I find out which electric company serves my Idaho address?",
        answer:
          "Check the Idaho Public Utilities Commission's service area maps or its list of utilities by city, then confirm with the utility, since some cities are split between providers.",
      },
    ],
    sources: [
      {
        label: "Idaho State Tax Commission: Occasional sellers",
        url: "https://tax.idaho.gov/taxes/sales-use/exemptions/occasional-sales-exemption/",
      },
      {
        label: "CPSC: FAQs for buying and selling products online",
        url: "https://www.cpsc.gov/About-CPSC/Division-of-Field-Operations/FAQs-For-Buying-and-Selling-Products-Online",
      },
      { label: "CPSC: Recalls and product safety warnings", url: "https://www.cpsc.gov/Recalls" },
      {
        label: "CPSC: Crib information center",
        url: "https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Full-Size-Baby-Cribs/Crib-Information-Center-",
      },
      {
        label: "SaferProducts.gov (report an unsafe product)",
        url: "https://www.saferproducts.gov/",
      },
      {
        label: "Idaho Public Utilities Commission: Utility maps",
        url: "https://puc.idaho.gov/Page/Standard/20",
      },
      {
        label: "Idaho Public Utilities Commission: Utilities by city",
        url: "https://puc.idaho.gov/Fileroom/PublicFiles/Consumer/cities.pdf",
      },
      {
        label: "Idaho Transportation Department: New to Idaho",
        url: "https://itd.idaho.gov/guide/new-to-idaho/",
      },
    ],
    related: [
      { label: "Furniture for sale in Idaho", path: "/idaho/furniture" },
      { label: "Home and garden in Idaho", path: "/idaho/home-garden" },
      {
        label: "New to Idaho: title and register your vehicle",
        path: "/guides/new-to-idaho-title-and-register-your-vehicle",
      },
    ],
    categories: ["furniture", "home-garden", "baby-kids"],
  },
];

export function guidesForCategory(categorySlug: string | undefined) {
  return categorySlug ? guides.filter((guide) => guide.categories.includes(categorySlug)) : [];
}

export function guideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug) ?? null;
}

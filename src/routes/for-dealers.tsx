import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Plus } from "lucide-react";
import { brand } from "@/config/brand";
import { dealerLandingSearch } from "@/lib/dealer-inquiry-contract";
import { DealerProductPreview } from "@/components/dealers/DealerProductPreview";
import {
  DealerSetupExplorer,
  type DealerSetupDraft,
} from "@/components/dealers/DealerSetupExplorer";
import { DealerInquiryForm } from "@/components/dealers/DealerInquiryForm";
import { trackEvent } from "@/lib/analytics";
import "@/styles/dealer-landing.css";

const description =
  "Connect your dealership’s inventory with Bluebird Marketplace. Showcase your vehicles for shoppers across Idaho and Utah. Request an inventory connection.";
export const Route = createFileRoute("/for-dealers")({
  validateSearch: dealerLandingSearch,
  head: () => ({
    meta: [
      { title: "Find local car buyers | Bluebird for dealerships" },
      { name: "description", content: description },
      { property: "og:title", content: "Your inventory. Local buyers. | Bluebird Marketplace" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://onbluebird.com/for-dealers" },
      {
        property: "og:image",
        content: "https://onbluebird.com/images/dealers/find-local-buyers.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://onbluebird.com/for-dealers" }],
  }),
  component: DealerLanding,
});
const faqs = [
  [
    "Can you work with my current inventory provider?",
    "Tell us who manages your inventory, even if you’re not sure how it can be exported. We’ll review the available connection options with you. Compatibility and setup are confirmed for your dealership before anything goes live.",
  ],
  [
    "Will I need to enter every vehicle by hand?",
    "We’ll first look at your existing inventory source. Where a suitable feed or export is available, we can help map vehicle details and photos. The setup depends on your provider and the information available.",
  ],
  [
    "What does it cost?",
    "We’ll discuss the available arrangement and any costs with you before activation. This form requests a conversation; it doesn’t purchase a plan or commit your dealership to one.",
  ],
  [
    "What happens after I submit?",
    "The Bluebird team will review your request and contact you using the details you provide. Together, we’ll establish the inventory source, review how listings will appear, and confirm the next steps.",
  ],
  [
    "Does submitting publish my inventory?",
    "No. It doesn’t create a dealer account, connect a feed, or publish vehicles. Your inventory is reviewed before a live connection is activated.",
  ],
];
function CTA({
  className = "",
  label = "Connect my inventory",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href="#connect"
      className={`dealer-button ${className}`}
      onClick={() =>
        void trackEvent("dealer_cta_clicked", {
          route: "/for-dealers",
          placement: className.includes("sticky") ? "mobile" : "page",
        })
      }
    >
      {label}
      <ArrowRight size={19} />
    </a>
  );
}
function DealerLanding() {
  const search = Route.useSearch();
  const [setupDraft, setSetupDraft] = useState<DealerSetupDraft>({
    provider: "",
    inventoryCount: "",
  });
  const [formVisible, setFormVisible] = useState(true);
  useEffect(() => {
    void trackEvent("page_view", { route: "/for-dealers" });
    const element = document.getElementById("connect");
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="dealer-landing">
      <header className="dealer-header">
        <div className="dealer-container">
          <a href="/" aria-label="Bluebird Marketplace home">
            <img
              src="/images/brand/bluebird-marketplace-logo.png"
              alt="Bluebird Marketplace"
              width="184"
              height="68"
            />
          </a>
          <nav aria-label="Dealership navigation">
            <a href="#how-it-works">How it works</a>
            <CTA />
          </nav>
        </div>
      </header>
      <section className="dealer-hero">
        <div className="dealer-container dealer-hero-grid">
          <div className="dealer-hero-copy">
            <p className="dealer-hero-audience">For Idaho and Utah dealerships</p>
            <h1>
              Find local
              <br />
              <span>buyers.</span>
            </h1>
            <p className="dealer-hero-intro">
              Give Idaho and Utah shoppers another way to discover your vehicles. We’ll help connect
              your inventory, showcase your dealership, and make it easy for interested buyers to
              reach you.
            </p>
            <a href="#connect" className="dealer-hero-mobile-cta">
              Let’s connect your inventory <ArrowRight size={18} />
            </a>
            <div className="dealer-hero-art">
              <img
                src="/images/dealers/local-buyers.svg"
                width="720"
                height="330"
                alt="Illustration of a dealership, vehicles, and local buyers connected by a route through Idaho"
                fetchPriority="high"
              />
            </div>
          </div>
          <DealerInquiryForm
            attribution={search}
            draft={setupDraft}
            onDraftChange={setSetupDraft}
          />
        </div>
      </section>
      <section className="dealer-industry-stats" aria-labelledby="dealer-stats-title">
        <div className="dealer-container">
          <div className="dealer-stats-heading">
            <h2 id="dealer-stats-title">
              Car buyers shop around.
              <br />
              Give them another way to find you.
            </h2>
            <p>
              Your website matters. So does being visible while buyers compare their options
              elsewhere.
            </p>
          </div>
          <div className="dealer-stats-grid">
            {[
              {
                value: "75%",
                label: "of vehicle buyers used third-party websites",
                why: "Be discoverable beyond your own website.",
              },
              {
                value: "4.6",
                label: "websites visited by the average vehicle buyer",
                why: "Give shoppers another place to compare your vehicles.",
              },
              {
                value: "71%",
                label: "started shopping unsure which vehicle they would buy",
                why: "Get your inventory into the consideration set.",
              },
            ].map((stat) => (
              <article key={stat.value}>
                <strong>{stat.value}</strong>
                <h3>{stat.label}</h3>
                <p>{stat.why}</p>
              </article>
            ))}
          </div>
          <p className="dealer-stats-source">
            Source:{" "}
            <a
              href="https://www.coxautoinc.com/insights/cox-automotive-car-buyer-journey-study-finds-efficiency-digital-tools-and-ai-drive-record-satisfaction/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cox Automotive, 2025 Car Buyer Journey Study
            </a>{" "}
            (published January 2026). U.S. vehicle-buyer research; these are industry figures, not
            Bluebird audience or sales results.
          </p>
        </div>
      </section>
      <section className="dealer-section dealer-container" aria-labelledby="dealer-benefits">
        <div className="dealer-section-heading">
          <h2 id="dealer-benefits">
            Another local sales channel.
            <br />
            Built around your dealership.
          </h2>
          <p>
            Keep your website and existing tools. Add Bluebird as another place for local shoppers
            to find your vehicles and contact your team.
          </p>
        </div>
        <div className="dealer-benefit-grid">
          {[
            [
              "Help buyers find the right vehicle.",
              "Make, model, price, and location filters help shoppers narrow their search. Your photos and vehicle specifications help them decide which vehicles deserve a closer look.",
            ],
            [
              "Spend less time re-entering inventory.",
              "Where a suitable feed or export is available, we’ll help bring your vehicle details and photos into Bluebird. We review the setup with you before connecting it.",
            ],
            [
              "Keep the conversation with your team.",
              "Your dealership’s identity, location, and available contact options stay with the listing. Interested shoppers can see who is selling the vehicle and how to get in touch.",
            ],
          ].map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="dealer-preview-section">
        <div className="dealer-container dealer-preview-grid">
          <div>
            <h2>
              See how your vehicles
              <br />
              could look on Bluebird.
            </h2>
            <p>
              Switch between the listing card and vehicle page. Buyers can compare the essentials,
              take a closer look, and find your dealership’s contact options.
            </p>
            <ul>
              {[
                "Photos and vehicle specifications",
                "Clear pricing and city/state location",
                "Dealership identity and contact options",
              ].map((text) => (
                <li key={text}>
                  <Check size={18} />
                  {text}
                </li>
              ))}
            </ul>
            <CTA />
          </div>
          <DealerProductPreview />
        </div>
      </section>
      <DealerSetupExplorer draft={setupDraft} onChange={setSetupDraft} />
      <section id="how-it-works" className="dealer-section dealer-container">
        <div className="dealer-section-heading">
          <h2>Let’s get your lot connected.</h2>
          <p>You know your inventory. We’ll help work through the setup.</p>
        </div>
        <ol className="dealer-process">
          {[
            [
              "Tell us about your dealership.",
              "Share your website and the best person to contact. That’s enough to start.",
            ],
            [
              "We review your inventory source together.",
              "We’ll look at your provider or available export and work through the connection options.",
            ],
            [
              "Preview your listings before they go live.",
              "Confirm how your dealership and vehicles appear before activating the connection.",
            ],
          ].map(([title, text], index) => (
            <li key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="dealer-faq-section">
        <div className="dealer-container dealer-faq-grid">
          <div>
            <h2>Questions about getting listed?</h2>
            <p>
              Want to talk through your setup?
              <br />
              <a href={`mailto:${brand.supportEmail}`}>
                Email the Bluebird team <ArrowRight size={15} />
              </a>
            </p>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={19} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="dealer-final dealer-container">
        <div>
          <img
            className="dealer-final-logo"
            src="/images/brand/bluebird-marketplace-logo.png"
            alt="Bluebird Marketplace"
            width="200"
            height="74"
            loading="lazy"
          />
          <h2>
            Get your dealership
            <br />
            in front of local shoppers.
          </h2>
          <p>Start with a conversation about your dealership.</p>
        </div>
        <CTA />
      </section>
      <footer className="dealer-footer dealer-container">
        <a href="/" aria-label="Bluebird Marketplace home">
          <img
            src="/images/brand/bluebird-marketplace-logo.png"
            alt="Bluebird Marketplace"
            width="150"
            height="55"
            loading="lazy"
          />
        </a>
        <p>© {new Date().getFullYear()} Bluebird Marketplace</p>
        <nav aria-label="Dealership footer">
          <a href={`mailto:${brand.supportEmail}`}>Contact</a>
          <a href="/policies#privacy">Privacy</a>
          <a href="/policies">Policies</a>
        </nav>
      </footer>
      {!formVisible && (
        <div className="dealer-sticky">
          <CTA className="dealer-sticky-button" />
        </div>
      )}
    </div>
  );
}

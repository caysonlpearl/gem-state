import { useState } from "react";
import { MapPin, Heart, ArrowRight } from "lucide-react";
export function DealerProductPreview() {
  const [view, setView] = useState<"card" | "page">("card");
  return (
    <div className="dealer-product-preview" aria-label="Interactive illustrative listing preview">
      <div className="dealer-preview-tabs" role="tablist" aria-label="Vehicle listing preview">
        {(
          [
            ["card", "Listing card"],
            ["page", "Vehicle page"],
          ] as const
        ).map(([key, label]) => (
          <button
            id={`preview-tab-${key}`}
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            aria-controls="dealer-preview-panel"
            tabIndex={view === key ? 0 : -1}
            onClick={() => setView(key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = view === "card" ? "page" : "card";
                setView(next);
                document.getElementById(`preview-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="dealer-preview-panel"
        role="tabpanel"
        aria-labelledby={`preview-tab-${view}`}
        className={`dealer-interactive-preview ${view}`}
      >
        {view === "card" ? (
          <article className="dealer-sample-card">
            <div className="dealer-sample-photo">
              <img
                src="/images/mock-vehicles/jeep-wrangler.jpg"
                alt="Illustrative vehicle photograph"
                width="520"
                height="360"
                loading="lazy"
              />
              <span aria-hidden="true">
                <Heart size={17} />
              </span>
            </div>
            <div className="dealer-sample-card-body">
              <strong>$28,900</strong>
              <h3>2021 Jeep Wrangler Unlimited</h3>
              <p>2021 · 42,000 mi · Automatic · 4WD</p>
              <p className="dealer-sample-dealer">Your dealership</p>
              <p>
                <MapPin size={12} /> Boise, ID
              </p>
              <small>
                Contact seller <span>Example listing</span>
              </small>
            </div>
          </article>
        ) : (
          <article className="dealer-demo-page">
            <img
              src="/images/mock-vehicles/jeep-wrangler.jpg"
              alt="Illustrative vehicle photograph"
              width="520"
              height="360"
              loading="lazy"
            />
            <div className="dealer-demo-page-body">
              <h3>2021 Jeep Wrangler Unlimited</h3>
              <strong>$28,900</strong>
              <p>
                <MapPin size={13} /> Boise, ID · Your dealership
              </p>
              <dl>
                {[
                  ["Mileage", "42,000 mi"],
                  ["Transmission", "Automatic"],
                  ["Drivetrain", "4WD"],
                  ["Seller type", "Dealership"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="dealer-demo-contact">
                Your dealership’s contact options appear alongside the vehicle.
              </p>
              <a href="#connect" className="dealer-button">
                Get my dealership listed <ArrowRight size={16} />
              </a>
            </div>
          </article>
        )}
      </div>
      <p className="dealer-preview-caption">
        Interactive example, not an active offer. Vehicle, price, mileage, and dealership details
        are illustrative.
      </p>
    </div>
  );
}

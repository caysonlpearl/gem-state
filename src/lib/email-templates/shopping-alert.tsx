import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { brand } from "../../config/brand";
import {
  MARKETING_CAMPAIGNS,
  marketingSubject,
  safeMarketingImage,
  type MarketingCampaign,
} from "../shopping-marketing";
import type { TemplateEntry } from "./registry";

export type MarketingItem = {
  title: string;
  price: string;
  reason: string;
  url: string;
  imageUrl?: string;
  location?: string;
  seller?: string;
  previousPrice?: string;
  saving?: string;
};
export type MarketingEmailProps = {
  campaign?: MarketingCampaign;
  items?: MarketingItem[];
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  openUrl?: string;
  moreUrl?: string;
  postalAddress?: string;
};
const color = {
  navy: "#15364b",
  blue: "#0074b8",
  muted: "#51616d",
  border: "#e1e6e8",
  cream: "#f8f7f2",
  white: "#ffffff",
  green: "#12613f",
};
const copy = { color: color.muted, fontSize: "16px", lineHeight: "1.6", margin: "0 0 20px" };
const button = {
  backgroundColor: color.blue,
  color: color.white,
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "16px",
  lineHeight: "22px",
  padding: "14px 24px",
  textDecoration: "none",
};
const link = { color: color.blue, textDecoration: "underline" };

function Listing({ item, lead = false }: { item: MarketingItem; lead?: boolean }) {
  const image = safeMarketingImage(item.imageUrl);
  return (
    <Section style={{ marginBottom: lead ? "24px" : "10px" }}>
      {image && (
        <Link href={item.url}>
          <Img
            src={image}
            alt={item.title}
            width={lead ? "536" : "256"}
            height={lead ? "300" : "172"}
            className="listing-photo"
            style={{
              width: "100%",
              maxWidth: "100%",
              height: lead ? "300px" : "172px",
              objectFit: "cover",
              borderRadius: "10px",
              display: "block",
              marginBottom: "14px",
            }}
          />
        </Link>
      )}
      <Text
        style={{
          color: color.navy,
          fontSize: lead ? "28px" : "22px",
          fontWeight: 700,
          lineHeight: "1.2",
          margin: "0 0 6px",
        }}
      >
        {item.price}
      </Text>
      {item.previousPrice && (
        <Text style={{ ...copy, fontSize: "14px", margin: "0 0 9px" }}>
          <span style={{ textDecoration: "line-through" }}>{item.previousPrice}</span>
          {item.saving && (
            <span style={{ color: color.green, fontWeight: 700 }}> · Save {item.saving}</span>
          )}
        </Text>
      )}
      <Text
        style={{
          color: color.navy,
          fontSize: "16px",
          fontWeight: 600,
          lineHeight: "1.45",
          margin: "0 0 7px",
          overflowWrap: "anywhere",
        }}
      >
        <Link href={item.url} style={{ color: color.navy, textDecoration: "none" }}>
          {item.title}
        </Link>
      </Text>
      {(item.location || item.seller) && (
        <Text style={{ ...copy, fontSize: "14px", lineHeight: "1.45", margin: "0 0 7px" }}>
          {[item.location, item.seller].filter(Boolean).join(" · ")}
        </Text>
      )}
      <Text style={{ ...copy, fontSize: "13px", lineHeight: "1.4", margin: "0" }}>
        {item.reason}
      </Text>
    </Section>
  );
}
export function ShoppingMarketingEmail({
  campaign = "similar_new",
  items = [],
  unsubscribeUrl,
  preferencesUrl,
  openUrl,
  moreUrl,
  postalAddress = brand.mailingAddress,
}: MarketingEmailProps) {
  const message = MARKETING_CAMPAIGNS[campaign];
  const shown = items.slice(0, 6);
  const lead = message.layout === "lead" || shown.length === 1;
  const primary = lead ? shown[0]?.url : (moreUrl ?? shown[0]?.url);
  const preview =
    campaign === "price_drop" && shown[0]
      ? `${shown[0].price}${shown[0].saving ? ` · Save ${shown[0].saving}` : ""} · ${shown[0].title}`
      : campaign === "search_match"
        ? `${shown.length} new ${shown.length === 1 ? "listing matches" : "listings match"} your saved search.`
        : message.intro;
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <style>{`@media only screen and (max-width: 520px) { .email-pad { padding-left:20px!important;padding-right:20px!important; } .listing-column { display:block!important;width:100%!important;padding:0 0 22px!important; } .listing-photo { height:auto!important;max-height:none!important; } .email-heading {font-size:28px!important;} }`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          backgroundColor: color.cream,
          fontFamily: "Arial, Helvetica, sans-serif",
          color: color.navy,
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            width: "100%",
            margin: "0 auto",
            backgroundColor: color.white,
          }}
        >
          <Section className="email-pad" style={{ padding: "26px 32px 20px" }}>
            <Link href={brand.urls.siteUrl}>
              <Img
                src={`${brand.urls.siteUrl}/images/brand/bluebird-marketplace-logo.png`}
                alt="Bluebird Marketplace"
                width="180"
                height="75"
                style={{ display: "block", maxWidth: "100%", objectFit: "contain" }}
              />
            </Link>
          </Section>
          <Section className="email-pad" style={{ padding: "8px 32px 12px" }}>
            <Heading
              className="email-heading"
              as="h1"
              style={{
                margin: "0 0 14px",
                fontSize: "32px",
                fontWeight: 700,
                lineHeight: "1.15",
                letterSpacing: "-0.7px",
                color: color.navy,
              }}
            >
              {message.heading}
            </Heading>
            <Text style={copy}>{message.intro}</Text>
            {!lead && primary && (
              <Section style={{ padding: "0 0 24px" }}>
                <Button href={primary} style={button}>
                  {message.action}
                </Button>
              </Section>
            )}
            {lead
              ? shown[0] && <Listing item={shown[0]} lead />
              : Array.from({ length: Math.ceil(shown.length / 2) }, (_, row) => (
                  <Row key={row} style={{ marginBottom: "22px" }}>
                    {shown.slice(row * 2, row * 2 + 2).map((item, index) => (
                      <Column
                        key={item.url}
                        className="listing-column"
                        style={{
                          width: "50%",
                          verticalAlign: "top",
                          paddingRight: index === 0 ? "12px" : "0",
                          paddingLeft: index === 1 ? "12px" : "0",
                        }}
                      >
                        <Listing item={item} />
                      </Column>
                    ))}
                  </Row>
                ))}
            {lead && primary && (
              <Section style={{ padding: "0 0 26px" }}>
                <Button href={primary} style={button}>
                  {message.action}
                </Button>
              </Section>
            )}
            {lead && shown.length > 1 && (
              <>
                <Hr style={{ borderColor: color.border, margin: "0 0 22px" }} />
                <Heading
                  as="h2"
                  style={{ color: color.navy, fontSize: "20px", margin: "0 0 18px" }}
                >
                  More updates for you
                </Heading>
                {shown.slice(1, 4).map((item) => (
                  <Listing key={item.url} item={item} />
                ))}
              </>
            )}
            {lead && moreUrl && (
              <Text style={{ ...copy, fontSize: "14px" }}>
                <Link href={moreUrl} style={link}>
                  View all your shopping updates
                </Link>
              </Text>
            )}
          </Section>
          <Section
            className="email-pad"
            style={{
              borderTop: `1px solid ${color.border}`,
              backgroundColor: color.cream,
              padding: "22px 32px 28px",
            }}
          >
            <Text style={{ ...copy, fontSize: "12px", margin: "0 0 12px" }}>
              {campaign === "search_match"
                ? "You received this email because you requested updates for a saved search."
                : "You received this email because you opted in to Bluebird shopping emails."}
            </Text>
            <Text style={{ ...copy, fontSize: "13px", margin: "0 0 15px" }}>
              {preferencesUrl && (
                <>
                  <Link href={preferencesUrl} style={link}>
                    Email preferences
                  </Link>
                  {" · "}
                </>
              )}
              {unsubscribeUrl && (
                <Link href={unsubscribeUrl} style={link}>
                  Turn off shopping emails and notifications
                </Link>
              )}
            </Text>
            <Text style={{ ...copy, fontSize: "12px", margin: "0 0 6px" }}>
              Bluebird Marketplace · {postalAddress}
            </Text>
            <Link href={`mailto:${brand.supportEmail}`} style={{ ...link, fontSize: "12px" }}>
              Contact Bluebird
            </Link>
          </Section>
          {openUrl && <Img src={openUrl} width="1" height="1" alt="" />}
        </Container>
      </Body>
    </Html>
  );
}
export function marketingTemplate(campaign: MarketingCampaign): TemplateEntry {
  return {
    component: (props) => <ShoppingMarketingEmail {...props} campaign={campaign} />,
    subject: (data) =>
      marketingSubject(
        campaign,
        data.items?.[0]?.title ?? "",
        Math.min(data.items?.length ?? 0, 6),
      ),
    displayName: MARKETING_CAMPAIGNS[campaign].name,
    previewData: { campaign, items: [] },
  };
}
export const template: TemplateEntry = {
  component: ShoppingMarketingEmail,
  subject: (data) =>
    marketingSubject(
      data.campaign ?? "similar_new",
      data.items?.[0]?.title ?? "",
      Math.min(data.items?.length ?? 0, 6),
    ),
  displayName: "Shopping updates",
  previewData: { items: [] },
};

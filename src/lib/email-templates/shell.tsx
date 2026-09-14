import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import {
  button,
  colors,
  container,
  darkModeCss,
  footer,
  h1,
  main,
  rule,
  text,
  wordmark,
} from "./theme";

export const SITE_URL = "https://gemstateclassifieds.com";

const factRow = {
  fontSize: "13.5px",
  color: colors.ink,
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const factLabel = {
  color: colors.faint,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  fontSize: "11px",
};

const factsBox = {
  backgroundColor: colors.cream,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  padding: "16px 18px",
  margin: "0 0 24px",
};

export type Fact = { label: string; value: string };

export function EmailShell({
  preview,
  heading,
  intro,
  facts,
  ctaLabel,
  ctaPath,
  note,
  children,
}: {
  preview: string;
  heading: string;
  intro?: string;
  facts?: Fact[];
  ctaLabel?: string;
  ctaPath?: string;
  note?: string;
  children?: React.ReactNode;
}) {
  const rows = (facts ?? []).filter((f) => f.value);
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <style>{darkModeCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Link href={SITE_URL} style={wordmark}>
            Gem State Classifieds
          </Link>
          <Hr style={rule} />
          <Heading style={h1}>{heading}</Heading>
          {intro ? <Text style={text}>{intro}</Text> : null}
          {rows.length > 0 ? (
            <Section style={factsBox}>
              {rows.map((f) => (
                <Text key={f.label} style={factRow}>
                  <span style={factLabel}>{f.label}</span>
                  <br />
                  {f.value}
                </Text>
              ))}
            </Section>
          ) : null}
          {children}
          {ctaLabel && ctaPath ? (
            <Section style={{ margin: "0 0 26px" }}>
              <Button className="dm-btn" style={button} href={`${SITE_URL}${ctaPath}`}>
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
          {note ? <Text style={text}>{note}</Text> : null}
          <Text style={footer}>
            Gem State Classifieds is an independent marketplace. Listings are created by
            individual sellers, who are responsible for their descriptions, photos, pricing, and
            legal right to sell each item.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function money(cents?: number | null, currency = "USD") {
  if (cents == null || !Number.isFinite(cents)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

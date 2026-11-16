import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { brand } from "../../config/brand";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SIGNUP_EMAIL_SUBJECT = "Confirm your Bluebird account";
const siteUrl = brand.urls.siteUrl;

/** Shared by the website mail hook and the installed Supabase HTML template.
 * The action URL is supplied by Auth; it must never be rebuilt or tracked here. */
export const SignupEmail = ({ confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <style>{`
        @media only screen and (max-width: 600px) {
          .confirmation-wrap { padding: 24px 16px !important; }
          .confirmation-card { padding: 28px 24px !important; }
        }
      `}</style>
    </Head>
    <Preview>One quick step to finish creating your Bluebird account.</Preview>
    <Body style={styles.body}>
      <Section className="confirmation-wrap" style={styles.wrap}>
        <Container style={styles.container}>
          <Section className="confirmation-card" style={styles.card}>
            <Link href={siteUrl} style={styles.logoLink}>
              <Img
                src={`${siteUrl}/images/brand/bluebird-marketplace-logo.png`}
                alt={brand.name}
                width="192"
                height="78"
                style={styles.logo}
              />
            </Link>
            <Heading as="h1" style={styles.heading}>
              Confirm your email
            </Heading>
            <Text style={styles.copy}>
              Thanks for signing up. Confirm your email address to finish creating your Bluebird
              account.
            </Text>
            <Section style={styles.action}>
              <Button href={confirmationUrl} style={styles.button}>
                Confirm email address
              </Button>
            </Section>
            <Text style={styles.note}>
              Didn’t create an account? You can safely ignore this email.
            </Text>
          </Section>
          <Text style={styles.footer}>
            <Link href={siteUrl} style={styles.footerLink}>
              onbluebird.com
            </Link>
            {" · "}
            <Link href={`${siteUrl}/contact`} style={styles.footerLink}>
              Contact Bluebird
            </Link>
          </Text>
        </Container>
      </Section>
    </Body>
  </Html>
);

const styles = {
  body: {
    margin: "0",
    backgroundColor: "#f8f6ef",
    color: "#223a47",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    WebkitTextSizeAdjust: "100%" as const,
  },
  wrap: { padding: "40px 20px" },
  container: { width: "100%", maxWidth: "520px", margin: "0 auto" },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e6e2d9",
    borderRadius: "16px",
    padding: "36px",
  },
  logoLink: { display: "inline-block", textDecoration: "none" },
  logo: { display: "block", margin: "0 0 32px", backgroundColor: "#ffffff" },
  heading: {
    color: "#223a47",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: 400,
    margin: "0 0 16px",
  },
  copy: { color: "#4e626c", fontSize: "16px", lineHeight: "26px", margin: "0" },
  action: { margin: "28px 0" },
  button: {
    backgroundColor: "#223a47",
    borderRadius: "8px",
    color: "#ffffff",
    fontFamily: "Verdana, Geneva, Tahoma, sans-serif",
    fontSize: "15px",
    lineHeight: "20px",
    fontWeight: 700,
    padding: "15px 24px",
    textDecoration: "none",
    textAlign: "center" as const,
  },
  note: { color: "#5e6d75", fontSize: "14px", lineHeight: "22px", margin: "0" },
  footer: {
    color: "#5f6a6e",
    fontSize: "12px",
    lineHeight: "20px",
    textAlign: "center" as const,
    margin: "20px 0 0",
  },
  footerLink: { color: "#5f6a6e", textDecoration: "underline" },
};

export default SignupEmail;

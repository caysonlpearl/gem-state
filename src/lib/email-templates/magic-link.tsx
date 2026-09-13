import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";

import { button, container, darkModeCss, footer, h1, main, rule, text, wordmark } from "./theme";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Your sign-in link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={wordmark}>{siteName}</Text>
        <Hr style={rule} />
        <Heading style={h1}>Your sign-in link</Heading>
        <Text style={text}>
          Use the button below to sign in to {siteName}. For your security, the link expires shortly
          and can only be used once.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Sign in
        </Button>
        <Text style={footer}>
          If you didn&apos;t request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;

import * as React from "react";

import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

import { codeStyle, container, footer, h1, main, rule, text, wordmark } from "./theme";

interface ReauthenticationEmailProps {
  siteName?: string;
  token: string;
}

export const ReauthenticationEmail = ({
  siteName = "Gem State Classifieds",
  token,
}: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={wordmark}>{siteName}</Text>
        <Hr style={rule} />
        <Heading style={h1}>Confirm it&apos;s you</Heading>
        <Text style={text}>Enter this code to confirm your identity and continue:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. If you didn&apos;t request it, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;

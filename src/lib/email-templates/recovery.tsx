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

interface RecoveryEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Reset your {siteName} password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={wordmark}>{siteName}</Text>
        <Hr style={rule} />
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset the password on your {siteName}
          account. Choose a new password using the button below.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Reset password
        </Button>
        <Text style={footer}>
          If you didn&apos;t request a reset, you can safely ignore this email and your password
          will stay the same.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default RecoveryEmail;

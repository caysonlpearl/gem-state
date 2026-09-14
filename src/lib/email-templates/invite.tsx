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
  Text,
} from "@react-email/components";

import { button, container, darkModeCss, footer, h1, main, rule, text, wordmark } from "./theme";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>You&apos;ve been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Link href={siteUrl} style={wordmark}>
          {siteName}
        </Link>
        <Hr style={rule} />
        <Heading style={h1}>You&apos;ve been invited</Heading>
        <Text style={text}>
          You&apos;ve been invited to join {siteName}, an Idaho marketplace for cars, trucks, outdoor
          gear, tools, home goods, and more. Accept the invitation below to set up your account.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Accept invitation
        </Button>
        <Text style={footer}>
          If you weren&apos;t expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default InviteEmail;

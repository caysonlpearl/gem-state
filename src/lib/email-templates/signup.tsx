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

import {
  button,
  container,
  darkModeCss,
  footer,
  h1,
  link,
  main,
  rule,
  text,
  wordmark,
} from "./theme";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Confirm your email to finish setting up {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Link href={siteUrl} style={wordmark}>
          {siteName}
        </Link>
        <Hr style={rule} />
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for creating a {siteName} account. Confirm{" "}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>{" "}
          to start buying, listing and following park merchandise.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Confirm email
        </Button>
        <Text style={footer}>
          If you didn&apos;t create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;

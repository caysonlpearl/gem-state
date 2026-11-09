import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Link,
  Hr,
} from "@react-email/components";
import type { DealerInquiry } from "../dealer-inquiry-contract";
import type { TemplateEntry } from "./registry";
function DealerInquiryEmail(lead: DealerInquiry) {
  return (
    <Html>
      <Head />
      <Preview>Inventory connection request: {lead.dealership_name}</Preview>
      <Body
        style={{ backgroundColor: "#faf8f1", fontFamily: "Arial,sans-serif", color: "#17384b" }}
      >
        <Container style={{ padding: "32px", backgroundColor: "#fff" }}>
          <Text>BLUEBIRD MARKETPLACE · DEALERSHIPS</Text>
          <Heading>New inventory connection request</Heading>
          {[
            ["Dealership", lead.dealership_name],
            ["Website", lead.website],
            ["Contact", lead.name],
            ["Email", lead.email],
            ["Phone", lead.phone],
            ["Inventory provider", lead.provider],
            ["Vehicle count", lead.inventory_count],
            ["Notes", lead.notes],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <Text key={label} style={{ whiteSpace: "pre-wrap" }}>
                <strong>{label}:</strong> {value}
              </Text>
            ))}
          <Hr />
          <Link href="https://onbluebird.com/admin/dealer-inquiries">
            Open dealership inquiries
          </Link>
          <Text>Reply to this email to reach the dealership contact.</Text>
        </Container>
      </Body>
    </Html>
  );
}
export const template = {
  component: DealerInquiryEmail,
  subject: "New Bluebird dealership inquiry",
  to: "bluebirdmarketplaceid@gmail.com",
  displayName: "Dealership inventory inquiry",
} satisfies TemplateEntry;

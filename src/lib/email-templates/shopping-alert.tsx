import { Link, Text, Img } from "@react-email/components";
import { EmailShell } from "./shell";
import type { TemplateEntry } from "./registry";
type Props = {
  items?: { title: string; price: string; reason: string; url: string }[];
  unsubscribeUrl?: string;
  openUrl?: string;
  moreUrl?: string;
};
function ShoppingAlert({ items = [], unsubscribeUrl, openUrl, moreUrl }: Props) {
  return (
    <EmailShell
      preview="Updates for your shopping"
      heading="Your Bluebird shopping updates"
      intro="Updates based on your saved searches and shopping interests."
    >
      {items.map((item) => (
        <Text key={item.url}>
          <Link href={item.url}>{item.title}</Link>
          <br />
          {item.price}
          <br />
          {item.reason}
        </Text>
      ))}
      {moreUrl && (
        <Text>
          <Link href={moreUrl}>View all shopping updates</Link>
        </Text>
      )}
      {unsubscribeUrl && (
        <Text>
          <Link href={unsubscribeUrl}>Turn off shopping emails and notifications</Link>
        </Text>
      )}
      {openUrl && <Img src={openUrl} width="1" height="1" alt="" />}
    </EmailShell>
  );
}
export const template = {
  component: ShoppingAlert,
  subject: (data: Record<string, any>) =>
    data.items?.length === 1
      ? `Shopping update: ${data.items[0].title}`
      : "Your Bluebird shopping updates",
  displayName: "Shopping updates",
  previewData: { items: [] },
} satisfies TemplateEntry;

import { useState, type AnchorHTMLAttributes, type ComponentType } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { brand } from "@/config/brand";
import {
  AccountSectionHeader as SectionHeader,
  AccountEmptyState as EmptyState,
} from "./AccountSectionView";
import type { NotificationInbox } from "@/lib/notification-model";
export type NotificationLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
const DefaultLink = (props: NotificationLinkProps) => <a {...props} />;
/** Actual website notification center; data, read acknowledgements and URLs are adapters. */
export function NotificationsSectionView({
  data,
  onMarkRead,
  pending = false,
  error,
  renderLink: NotificationLink = DefaultLink,
  description = "Listing updates, messages, saved-search matches, reviews, and seller billing activity will appear here.",
}: {
  data?: NotificationInbox;
  onMarkRead: (ids: string[] | null) => void | Promise<void>;
  pending?: boolean;
  error?: string;
  description?: string;
  renderLink?: ComponentType<NotificationLinkProps>;
}) {
  const [filter, setFilter] = useState("all");
  const items = data?.items ?? [];
  const visible = items.filter((item) => filter === "all" || item.kind === filter);
  const kinds = [...new Set(items.map((item) => item.kind).filter(Boolean))];
  const kindLabels: Record<string, string> = {
    message: "Messages",
    saved_search_match: "Saved search matches",
    listing_reviewed: "Listing review",
    listing_upgrade: "Listing promotion",
    review_request: "Review requests",
  };
  const notificationText = (value: string) =>
    value.replaceAll("ParkVault", brand.name).replaceAll("Gem State", brand.name);
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm">
          {error}
        </p>
      )}
      <SectionHeader
        eyebrow="Activity"
        title={`${data?.unread ?? 0} unread notifications`}
        body={description}
        action={
          (data?.unread ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => void onMarkRead(null)}
              disabled={pending}
              className="h-9 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="text-[12px] font-medium text-muted-foreground"
          htmlFor="notification-filter"
        >
          Filter
        </label>
        <select
          id="notification-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="field max-w-[220px]"
        >
          <option value="all">All activity</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabels[kind] ?? kind.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No notifications yet" : "No matching notifications"}
          body="Your account activity will appear here as you use Bluebird."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {visible.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-3 p-4 ${item.readAt ? "" : "bg-secondary/30"}`}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] font-semibold">
                    {notificationText(item.title)}
                  </p>
                  <p className="mt-1 break-words text-[12.5px] leading-relaxed text-muted-foreground">
                    {notificationText(item.body)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {item.destinationUrl && (
                      <NotificationLink
                        href={item.destinationUrl}
                        className="inline-flex text-[11.5px] font-semibold text-primary hover:underline"
                      >
                        {item.entityType === "conversation"
                          ? "Open conversation"
                          : item.entityType === "listing"
                            ? "Open listing"
                            : "Open related activity"}
                        <ArrowRight size={13} className="ml-1" />
                      </NotificationLink>
                    )}
                    {!item.readAt && (
                      <button
                        type="button"
                        onClick={() => void onMarkRead([item.id])}
                        disabled={pending}
                        className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

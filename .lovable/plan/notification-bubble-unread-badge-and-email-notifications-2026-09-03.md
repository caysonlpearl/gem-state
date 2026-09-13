# Notification bubble, unread badge, and email notifications

## What changes for members

Clicking the bell in the header no longer jumps to a full page. It opens a small dropdown anchored under the bell showing the most recent notifications, with a "See all notifications" button at the bottom that goes to the notifications page. A small count badge sits on the bell whenever there are unread notifications.

Email notifications are planned as a second step: they require a sender domain you own, which isn't set up yet. Part 1 (bubble + badge) ships now; part 2 (emails) is ready to build the moment a domain exists.

## Part 1 — Header notification bubble (build now)

- Add a dropdown panel to the bell in the header:
  - Header row: "Notifications" plus a "Mark all read" action when there are unread items.
  - The 5 most recent notifications: title, one-line body, relative time, an unread dot, and a link to the related order when there is one.
  - Empty state: honest "No notifications yet" copy, no placeholder rows.
  - Footer: "See all notifications" linking to the existing notifications page.
- Unread badge on the bell: numeric count, capped at "9+", hidden at zero, with a screen-reader label ("3 unread notifications").
- Opening the bubble marks the items it displays as read (existing mark-read call), so the badge clears the way members expect.
- Behavior details: closes on Escape, on outside click, and on navigation; focus returns to the bell; rendered only after hydration so server and client markup match the existing header pattern; mobile taps get a full-width sheet-style panel instead of a narrow dropdown.
- Data comes from the existing notifications server function, shared through one query key so the page and the bubble stay in sync; polled on a modest interval and refreshed on window focus.

## Part 2 — Email notifications (after a sender domain is set up)

Emails will be sent for the events you picked, one email per recipient per event, in the server code that already performs the action:

- Order paid / confirmed — buyer confirmation; seller "you sold an item"; park shopper "you have a new shopping job".
- Shipped and delivered — tracking added; delivery confirmation prompt.
- Listing approved / rejected — seller review outcome.
- Dispute and refund updates — dispute opened, dispute resolved, refund issued.

Wording will match pilot rules: no escrow, held funds, or captured-payment claims; no fabricated activity; each email links back into the app rather than restating operator detail.

Every email will also create the matching in-app notification, so the bell stays the source of truth. Unsubscribe handling and delivery/suppression are managed by the platform — nothing is stored in the app for that.

## Technical notes

- New component `src/components/layout/NotificationBell.tsx`, used by `SiteHeader.tsx`; the standalone notifications route stays as the "see all" destination.
- Reuses `getMyNotifications` / `markNotificationsRead` from `src/lib/notifications.functions.ts`; no schema, RLS, or database function changes.
- Part 2 will add React Email templates plus a server-only send helper, called from the existing server functions/RPC call sites for payment confirmation, shipment, delivery, listing review, dispute, and refund. No email tables, queues, or cron jobs.
- Part 2 is blocked on a verified sender domain (Project Settings -> Domains, or an external registrar).

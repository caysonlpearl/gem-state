import type { ReactNode } from "react";
import {
  UserCircle,
  Gear,
  Tag,
  BookmarkSimple,
  MagnifyingGlass,
  ChatCircle,
  Bell,
  Star,
  CreditCard,
  SignOut,
} from "@phosphor-icons/react";
import type { AccountSection } from "./account-sections";
const navItems: { section: AccountSection; label: string; icon: typeof UserCircle }[] = [
  { section: "overview", label: "Overview", icon: UserCircle },
  { section: "profile", label: "Profile", icon: UserCircle },
  { section: "settings", label: "Account & security", icon: Gear },
  { section: "listings", label: "Listings", icon: Tag },
  { section: "saved", label: "Saved listings", icon: BookmarkSimple },
  { section: "searches", label: "Saved searches", icon: MagnifyingGlass },
  { section: "messages", label: "Messages", icon: ChatCircle },
  { section: "notifications", label: "Notifications", icon: Bell },
  { section: "reviews", label: "Reviews & reputation", icon: Star },
];

export function AccountLayoutView({
  section,
  onSelect,
  onSignOut,
  unreadMessages = 0,
  unreadNotifications = 0,
  sellerVisible = false,
  adminLink,
  phoneAdminLink = adminLink,
  children,
  availableSections = navItems.map((item) => item.section),
  signOutBusy = false,
  as: Container = "main",
}: {
  section: AccountSection;
  onSelect: (section: AccountSection) => void;
  onSignOut: () => void;
  unreadMessages?: number;
  unreadNotifications?: number;
  sellerVisible?: boolean;
  adminLink?: ReactNode;
  phoneAdminLink?: ReactNode;
  children: ReactNode;
  availableSections?: readonly AccountSection[];
  signOutBusy?: boolean;
  as?: "main" | "section";
}) {
  return (
    <Container
      id={Container === "main" ? "main-content" : undefined}
      className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:hidden">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Member center
          </p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">Your account</h1>
        </div>
        <select
          aria-label="Account section"
          value={section}
          onChange={(event) => onSelect(event.target.value as AccountSection)}
          className="h-10 max-w-[170px] rounded-xl border border-input bg-card px-3 text-[12px] font-medium"
        >
          {navItems
            .filter((item) => availableSections.includes(item.section))
            .map((item) => (
              <option key={item.section} value={item.section}>
                {item.label}
              </option>
            ))}
          {sellerVisible && <option value="billing">Billing</option>}
        </select>
        {phoneAdminLink}
      </div>
      <div className="grid gap-8 lg:grid-cols-[236px_minmax(0,1fr)]">
        <AccountSidebar
          section={section}
          onSelect={onSelect}
          onSignOut={onSignOut}
          unreadMessages={unreadMessages}
          unreadNotifications={unreadNotifications}
          sellerVisible={sellerVisible}
          adminLink={adminLink}
          availableSections={availableSections}
          signOutBusy={signOutBusy}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
function AccountSidebar({
  section,
  onSelect,
  onSignOut,
  unreadMessages,
  unreadNotifications,
  sellerVisible,
  adminLink,
  availableSections = navItems.map((item) => item.section),
  signOutBusy = false,
}: {
  section: AccountSection;
  onSelect: (section: AccountSection) => void;
  onSignOut: () => void;
  unreadMessages: number;
  unreadNotifications: number;
  sellerVisible: boolean;
  adminLink?: ReactNode;
  availableSections?: readonly AccountSection[];
  signOutBusy?: boolean;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[108px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-secondary/45 px-5 py-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Bluebird</p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">My account</h1>
        </div>
        <nav aria-label="Account sections" className="p-2">
          {navItems
            .filter((item) => availableSections.includes(item.section))
            .map((item) => {
              const Icon = item.icon;
              const active = item.section === section;
              const badge =
                item.section === "messages"
                  ? unreadMessages
                  : item.section === "notifications"
                    ? unreadNotifications
                    : 0;
              return (
                <button
                  key={item.section}
                  type="button"
                  onClick={() => onSelect(item.section)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-secondary"}`}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] leading-5 ${active ? "bg-primary-foreground/15" : "bg-accent text-accent-foreground"}`}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </button>
              );
            })}
          {sellerVisible && (
            <button
              type="button"
              onClick={() => onSelect("billing")}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium transition-colors ${section === "billing" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-secondary"}`}
            >
              <CreditCard size={18} aria-hidden="true" />
              <span className="flex-1">Billing</span>
            </button>
          )}
          {adminLink}
        </nav>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onSignOut}
            disabled={signOutBusy}
            className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <SignOut size={18} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

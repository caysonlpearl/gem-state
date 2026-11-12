import type { ReactNode } from "react";
import { Phone, Envelope, ChatCircleDots, Globe, DeviceMobile } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DealerContactOptions({
  open,
  onOpenChange,
  name,
  phone,
  email,
  website,
  textPhone,
  messagingEnabled,
  onMessage,
  children,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  textPhone?: string | null;
  messagingEnabled: boolean;
  onMessage: () => void;
  children?: ReactNode;
  onAction?: (method: string) => void;
}) {
  const tile =
    "flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-primary transition hover:border-primary/40 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[28px] p-6 sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-[23px]">Contact {name}</DialogTitle>
          <DialogDescription>
            Choose how you’d like to connect with the dealership.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid grid-cols-2 gap-3" aria-label="Dealership contact methods">
          {phone ? (
            <a
              className={`${tile} col-start-1 row-start-1`}
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              onClick={() => onAction?.("call")}
            >
              <Phone size={28} weight="duotone" />
              <span>Call dealership</span>
              <span className="text-xs font-normal text-muted-foreground">{phone}</span>
            </a>
          ) : null}
          <button
            type="button"
            disabled={!messagingEnabled}
            onClick={() => {
              onOpenChange(false);
              onMessage();
            }}
            className={`${tile} col-start-2 row-start-1 disabled:cursor-default disabled:border-dashed disabled:opacity-60`}
          >
            <ChatCircleDots size={28} weight="duotone" />
            <span>Message on Bluebird</span>
            {!messagingEnabled ? (
              <span className="text-xs font-normal text-muted-foreground">Inbox unavailable</span>
            ) : null}
          </button>
          {website ? (
            <a
              className={`${tile} col-start-1 row-start-2`}
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onAction?.("website")}
            >
              <Globe size={28} weight="duotone" />
              <span>Visit website</span>
            </a>
          ) : null}
          {email ? (
            <a
              className={`${tile} col-start-2 row-start-2`}
              href={`mailto:${email}`}
              onClick={() => onAction?.("email")}
            >
              <Envelope size={28} weight="duotone" />
              <span>Email dealership</span>
            </a>
          ) : null}
          {textPhone ? (
            <a
              className={`${tile} col-span-2`}
              href={`sms:${textPhone.replace(/[^\d+]/g, "")}`}
              onClick={() => onAction?.("text")}
            >
              <DeviceMobile size={28} weight="duotone" />
              <span>Text dealership</span>
            </a>
          ) : null}
        </div>
        {!messagingEnabled ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This dealership’s Bluebird inbox isn’t open yet. Please use an available contact option
            above.
          </p>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}

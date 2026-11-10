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
        <div className="mt-2 grid grid-cols-2 gap-3">
          {phone ? (
            <a className={tile} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
              <Phone size={28} weight="duotone" />
              <span>Call dealership</span>
              <span className="text-xs font-normal text-muted-foreground">{phone}</span>
            </a>
          ) : null}
          {email ? (
            <a className={tile} href={`mailto:${email}`}>
              <Envelope size={28} weight="duotone" />
              <span>Email dealership</span>
            </a>
          ) : null}
          {textPhone ? (
            <a className={tile} href={`sms:${textPhone.replace(/[^\d+]/g, "")}`}>
              <DeviceMobile size={28} weight="duotone" />
              <span>Text dealership</span>
            </a>
          ) : null}
          <button
            type="button"
            disabled={!messagingEnabled}
            onClick={() => {
              onOpenChange(false);
              onMessage();
            }}
            className={`${tile} disabled:cursor-default disabled:border-dashed disabled:opacity-60`}
          >
            <ChatCircleDots size={28} weight="duotone" />
            <span>Message on Bluebird</span>
            {!messagingEnabled ? (
              <span className="text-xs font-normal text-muted-foreground">
                Inbox activation pending
              </span>
            ) : null}
          </button>
          {website ? (
            <a className={tile} href={website} target="_blank" rel="noopener noreferrer">
              <Globe size={28} weight="duotone" />
              <span>Visit website</span>
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

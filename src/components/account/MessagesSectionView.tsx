import { useEffect, useRef, type ReactNode } from "react";
import type { ConversationDetail, ConversationSummary } from "../../lib/conversation.functions";
import { MagnifyingGlass, PaperPlaneTilt } from "@phosphor-icons/react";
import {
  AccountSectionHeader as SectionHeader,
  AccountEmptyState as EmptyState,
} from "./AccountSectionView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";

export type MessagesSectionViewProps = {
  query: string;
  setQuery: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  activeList: ConversationSummary[];
  selected?: ConversationSummary;
  detail: ConversationDetail | null;
  onOpen: (id: string) => void;
  body: string;
  setBody: (value: string) => void;
  attachment: File | null;
  setAttachment: (file: File | null) => void;
  sending: boolean;
  blocking: boolean;
  reporting?: boolean;
  submitMessage: () => void;
  failedSend: "message" | "attachment" | null;
  reportOpen: boolean;
  setReportOpen: (value: boolean) => void;
  reportReason: string;
  setReportReason: (value: string) => void;
  reportSubmitted: boolean;
  blockOpen: boolean;
  setBlockOpen: (value: boolean) => void;
  onReport: () => void;
  onBlock: () => void;
  onError: (error: string) => void;
  browseAction: ReactNode;
  attachmentsEnabled?: boolean;
  loading?: boolean;
  error?: string;
};

/** The existing website conversation layout, shared with the bundled app. */
export function MessagesSectionView({
  query,
  setQuery,
  filter,
  setFilter,
  activeList,
  selected,
  detail,
  onOpen,
  body,
  setBody,
  attachment,
  setAttachment,
  sending,
  blocking,
  reporting = false,
  submitMessage,
  failedSend,
  reportOpen,
  setReportOpen,
  reportReason,
  setReportReason,
  reportSubmitted,
  blockOpen,
  setBlockOpen,
  onReport,
  onBlock,
  onError,
  browseAction,
  attachmentsEnabled = true,
  loading = false,
  error,
}: MessagesSectionViewProps) {
  const attachmentInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!attachment && attachmentInput.current) attachmentInput.current.value = "";
  }, [attachment]);
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Messages"
        title="Keep marketplace conversations together"
        body="Message buyers and sellers inside Bluebird. Your phone, text, and email buttons remain separate contact options on listings."
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading messages…
        </p>
      )}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-3 shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-border pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
            <label className="field flex items-center gap-2">
              <MagnifyingGlass size={15} className="text-muted-foreground" />
              <span className="sr-only">Search conversations</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              aria-label="Filter conversations"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="field"
            >
              <option value="all">All messages</option>
              <option value="unread">Unread</option>
              <option value="buying">Buying</option>
              <option value="selling">Selling</option>
            </select>
          </div>
          <div className="mt-3 max-h-[480px] space-y-1 overflow-y-auto">
            {activeList.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onOpen(item.id)}
                className={`w-full rounded-xl p-3 text-left transition-colors ${item.id === selected?.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12.5px] font-semibold">{item.listingTitle}</p>
                  {item.unread && (
                    <span
                      className={`size-2 rounded-full ${item.id === selected?.id ? "bg-accent" : "bg-primary"}`}
                    />
                  )}
                </div>
                <p
                  className={`mt-1 text-[11px] ${item.id === selected?.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  With {item.otherMemberName} · {new Date(item.lastMessageAt).toLocaleDateString()}
                </p>
              </button>
            ))}
            {activeList.length === 0 && (
              <p className="px-2 py-8 text-center text-[12px] text-muted-foreground">
                No conversations match these filters.
              </p>
            )}
          </div>
        </div>
        <div
          role="region"
          aria-label="Selected conversation"
          data-conversation-id={detail?.id}
          className="flex min-h-[420px] flex-col"
        >
          <div className="border-b border-border px-2 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold">
                  {detail?.listingTitle ?? "Select a conversation"}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {detail
                    ? `With ${detail.otherMemberName} · Keep payment details and sensitive information out of messages.`
                    : "Your buyer and seller conversations will appear here."}
                </p>
              </div>
              {detail && (
                <button
                  type="button"
                  onClick={() => setBlockOpen(true)}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                >
                  Block member
                </button>
              )}
            </div>
          </div>
          {detail ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${message.senderId === detail.buyerId ? "bg-secondary" : "ml-auto bg-primary text-primary-foreground"}`}
                  >
                    {message.senderLabel && (
                      <p className="mb-1 text-[10px] font-semibold">{message.senderLabel}</p>
                    )}
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
                    {message.attachmentUrl && (
                      <a
                        href={message.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-lg border border-current/30 px-2 py-1 text-[11px] font-semibold hover:opacity-80"
                      >
                        Open attachment
                      </a>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${message.senderId === detail.buyerId ? "text-muted-foreground" : "text-primary-foreground/70"}`}
                    >
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <form
                className="border-t border-border px-2 pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitMessage();
                }}
              >
                <textarea
                  aria-label="Reply"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Write a reply…"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  {attachmentsEnabled && (
                    <label className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                      <input
                        aria-label="Add attachment"
                        ref={attachmentInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (
                            file &&
                            (!new Set([
                              "image/jpeg",
                              "image/png",
                              "image/webp",
                              "application/pdf",
                            ]).has(file.type) ||
                              file.size > 10 * 1024 * 1024)
                          ) {
                            onError("Use a JPG, PNG, WebP, or PDF no larger than 10 MB.");
                            event.currentTarget.value = "";
                            setAttachment(null);
                            return;
                          }
                          setAttachment(file);
                        }}
                      />
                      <span className="max-w-full break-all rounded-lg border border-input px-2.5 py-1.5">
                        {attachment ? `Attach: ${attachment.name}` : "Add attachment"}
                      </span>
                    </label>
                  )}
                  {attachment && (
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2"
                    >
                      Remove attachment
                    </button>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setReportReason("");
                        setReportOpen(true);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Report conversation
                    </button>
                    <button
                      type="submit"
                      disabled={sending || blocking || (!body.trim() && !attachment)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Send"}
                      <PaperPlaneTilt size={14} weight="fill" />
                    </button>
                  </div>
                </div>
                {reportSubmitted && (
                  <p
                    role="status"
                    className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] text-primary"
                  >
                    Report submitted. Bluebird moderators can now review this conversation;
                    submitting again will update the existing report instead of creating a
                    duplicate.
                  </p>
                )}
                {failedSend && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                    <span>
                      {failedSend === "attachment"
                        ? "Attachment not sent. Your file is still selected."
                        : "Message not sent. Your text is still here."}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        submitMessage();
                      }}
                      disabled={sending}
                      className="font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      Retry send
                    </button>
                  </div>
                )}
                {attachmentsEnabled && (
                  <p className="mt-2 text-[10.5px] text-muted-foreground">
                    JPG, PNG, WebP, or PDF · 10 MB maximum. Never send payment details or sensitive
                    information.
                  </p>
                )}
              </form>
            </>
          ) : (
            <EmptyState
              title="No conversation selected"
              body="Open a conversation from a listing or select one from the list."
              action={browseAction}
            />
          )}
        </div>
      </div>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this conversation</DialogTitle>
            <DialogDescription>
              Tell us what happened. Reports are reviewed by Bluebird moderators.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
            placeholder="Reason for reporting"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reporting || !detail || reportReason.trim().length < 3}
              onClick={onReport}
            >
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block this member?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer receive messages from this conversation. You can contact support if
              you need help reversing a block.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={blocking}
              onClick={onBlock}
            >
              Block member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

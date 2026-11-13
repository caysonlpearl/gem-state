import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationSummary,
  ConversationDetail,
} from "../../../src/lib/conversation.functions";
import { MessagesSectionView } from "../../../src/components/account/MessagesSectionView";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { sendMessageOnce } from "./message-retries";
import { sendConversationAttachmentOnce } from "./conversation-attachments";

type Draft = { body: string; attachment: File | null };
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Bluebird could not complete this request.";
export function NativeMessages({
  ownerId,
  id,
  revision,
  attachmentsEnabled,
  onOpen,
  onBrowse,
}: {
  ownerId: string;
  id?: string;
  revision: number;
  attachmentsEnabled: boolean;
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [, redrawDrafts] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportedId, setReportedId] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [failures, setFailures] = useState<Record<string, "message" | "attachment" | null>>({});
  const drafts = useRef(new Map<string, Draft>());
  const alive = useRef(true);
  const sendLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const rows = await api<ConversationSummary[]>(
          "conversations",
          "GET",
          undefined,
          controller.signal,
          actor,
        );
        if (!controller.signal.aborted) {
          setConversations(rows);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoadingList(false);
      }
    };
    void load();
    const timer = setInterval(load, 60000);
    const foreground = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [actor, revision, refresh]);
  const rows =
    detail && detail.id === id && !conversations.some((c) => c.id === id)
      ? [detail, ...conversations]
      : conversations;
  const activeList = rows.filter(
    (item) =>
      (filter === "unread"
        ? item.unread
        : filter === "all" ||
          (filter === "buying" ? item.memberRole === "buyer" : item.memberRole === "seller")) &&
      item.listingTitle.toLowerCase().includes(query.toLowerCase()),
  );
  const explicit = id && filter === "all" && !query;
  const selected =
    activeList.find((item) => item.id === id) ?? (explicit ? undefined : activeList[0]);
  const selectedId = explicit ? id : selected?.id;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    setDetail((previous) => (previous?.id === selectedId ? previous : null));
    setReportOpen(false);
    setBlockOpen(false);
    setReportReason("");
    setError("");
    if (!selectedId) {
      setLoadingDetail(false);
      return;
    }
    const controller = new AbortController();
    let pending = false;
    setLoadingDetail(true);
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const value = await api<ConversationDetail>(
          `conversations/${selectedId}`,
          "GET",
          undefined,
          controller.signal,
          actor,
        );
        if (controller.signal.aborted) return;
        setDetail(value);
        setError("");
        if (value.unread) {
          await api(`conversations/${selectedId}/read`, "POST", {}, controller.signal, actor);
          if (!controller.signal.aborted) {
            setConversations((rows) =>
              rows.map((c) => (c.id === selectedId ? { ...c, unread: false } : c)),
            );
            document.dispatchEvent(new Event("bluebird-inbox-changed"));
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoadingDetail(false);
      }
    };
    void load();
    const timer = setInterval(load, 15000);
    const foreground = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [selectedId, actor, revision, refresh]);
  const draftKey = (target: string) => `bb-draft-message-${ownerId}-${target}`;
  const getDraft = (target: string): Draft => {
    const prior = drafts.current.get(target);
    if (prior) return prior;
    let body = "";
    try {
      body = sessionStorage.getItem(draftKey(target)) ?? "";
    } catch {
      /* Optional storage. */
    }
    const draft = { body, attachment: null };
    drafts.current.set(target, draft);
    return draft;
  };
  const current = selectedId ? getDraft(selectedId) : { body: "", attachment: null };
  const changeDraft = (next: Draft) => {
    if (!selectedId) return;
    drafts.current.set(selectedId, next);
    try {
      if (next.body) sessionStorage.setItem(draftKey(selectedId), next.body);
      else sessionStorage.removeItem(draftKey(selectedId));
    } catch {
      /* Memory fallback. */
    }
    redrawDrafts((n) => n + 1);
  };
  const submit = async () => {
    if (
      !selectedId ||
      detail?.id !== selectedId ||
      sendLock.current ||
      (!current.body.trim() && !current.attachment)
    )
      return;
    if (current.attachment && !attachmentsEnabled) {
      setError("Attachments are temporarily unavailable. You can still send a message.");
      return;
    }
    const target = selectedId,
      snapshot = current;
    sendLock.current = true;
    setSending(true);
    setError("");
    try {
      if (snapshot.attachment)
        await sendConversationAttachmentOnce(ownerId, target, snapshot.body, snapshot.attachment);
      else
        await sendMessageOnce(ownerId, `conversations/${target}/messages`, { body: snapshot.body });
      if (!alive.current) return;
      if (getDraft(target) === snapshot) {
        drafts.current.set(target, { body: "", attachment: null });
        try {
          sessionStorage.removeItem(draftKey(target));
        } catch {
          /* Optional storage. */
        }
        redrawDrafts((n) => n + 1);
      }
      setFailures((prior) => ({ ...prior, [target]: null }));
      setRefresh((n) => n + 1);
    } catch (e) {
      if (alive.current) {
        setFailures((prior) => ({
          ...prior,
          [target]: snapshot.attachment ? "attachment" : "message",
        }));
        if (selectedRef.current === target) setError(errorText(e));
      }
    } finally {
      sendLock.current = false;
      if (alive.current) setSending(false);
    }
  };
  const report = async () => {
    if (!selectedId || reporting || reportReason.trim().length < 3) return;
    const target = selectedId;
    setReporting(true);
    setError("");
    try {
      await api(
        `conversations/${target}/report`,
        "POST",
        { reason: reportReason },
        undefined,
        actor,
      );
      if (alive.current && selectedRef.current === target) {
        setReportOpen(false);
        setReportedId(target);
      }
    } catch (e) {
      if (alive.current && selectedRef.current === target) setError(errorText(e));
    } finally {
      if (alive.current) setReporting(false);
    }
  };
  const block = async () => {
    if (!selectedId || blocking) return;
    const target = selectedId;
    setBlocking(true);
    setError("");
    try {
      await api(`conversations/${target}/block`, "POST", {}, undefined, actor);
      if (alive.current) {
        setRefresh((n) => n + 1);
        document.dispatchEvent(new Event("bluebird-inbox-changed"));
      }
    } catch (e) {
      if (alive.current && selectedRef.current === target) setError(errorText(e));
    } finally {
      if (alive.current) setBlocking(false);
    }
  };
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">
      <MessagesSectionView
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
        activeList={activeList}
        selected={selected}
        detail={detail?.id === selectedId ? detail : null}
        onOpen={onOpen}
        body={current.body}
        setBody={(body) => changeDraft({ ...current, body })}
        attachment={current.attachment}
        setAttachment={(attachment) => changeDraft({ ...current, attachment })}
        sending={sending}
        blocking={blocking}
        reporting={reporting}
        submitMessage={() => void submit()}
        failedSend={selectedId ? (failures[selectedId] ?? null) : null}
        reportOpen={reportOpen}
        setReportOpen={setReportOpen}
        reportReason={reportReason}
        setReportReason={setReportReason}
        reportSubmitted={reportedId === selectedId}
        blockOpen={blockOpen}
        setBlockOpen={setBlockOpen}
        onReport={() => void report()}
        onBlock={() => void block()}
        onError={setError}
        browseAction={
          <a
            href="#/search"
            className="text-[12px] font-semibold text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              onBrowse();
            }}
          >
            Browse listings
          </a>
        }
        attachmentsEnabled={attachmentsEnabled}
        loading={loadingList || loadingDetail}
        error={error}
      />
    </section>
  );
}

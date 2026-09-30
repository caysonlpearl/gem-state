import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { RelativeTime } from "@/components/ui/relative-time";
import {
  getAdminConversationReports,
  resolveAdminConversationReport,
  type AdminConversationReport,
} from "@/lib/conversation.functions";

export const Route = createFileRoute("/_authenticated/admin/conversation-reports")({
  head: () => ({
    meta: [
      { title: "Conversation reports · Bluebird Marketplace" },
      { name: "description", content: "Review member reports about Bluebird conversations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConversationReportsPage,
});

function ReportRow({ report }: { report: AdminConversationReport }) {
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveAdminConversationReport);
  const [note, setNote] = useState(report.adminNote ?? "");
  const mutation = useMutation({
    mutationFn: (action: "reviewed" | "dismissed") =>
      resolve({ data: { reportId: report.id, action, adminNote: note } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-conversation-reports"] });
      toast.success("Conversation report updated.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update the report."),
  });

  return (
    <li className="border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">{report.listingTitle}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {report.buyerName} ↔ {report.sellerName} · Reported by {report.reporterName} ·{" "}
            <RelativeTime iso={report.createdAt} />
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-[10.5px] font-semibold capitalize">
          {report.status}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed">{report.reason}</p>
      <label className="mt-3 block text-[11.5px] font-medium">
        Operator note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 1000))}
          rows={2}
          placeholder="Record what was checked or what should happen next."
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[12px]"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate("reviewed")}
          disabled={mutation.isPending || report.status !== "open"}
          className="h-8 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          Mark reviewed
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate("dismissed")}
          disabled={mutation.isPending || report.status !== "open"}
          className="h-8 rounded-md border border-input px-2.5 text-[11.5px] font-medium disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

function ConversationReportsPage() {
  const fetchReports = useServerFn(getAdminConversationReports);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-conversation-reports"],
    queryFn: () => fetchReports(),
  });

  return (
    <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Bluebird operations
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Conversation reports</h1>
        <p className="mt-1 max-w-[700px] text-[13px] leading-relaxed text-muted-foreground">
          Review the participants, listing context, report reason, operator notes, and resolution
          state for member-reported conversations.
        </p>
      </div>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">
            Reports <span className="numeric text-muted-foreground">{data?.length ?? 0}</span>
          </h2>
        </div>
        {isLoading ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">Loading…</p>
        ) : isError || !data ? (
          <p className="px-4 py-8 text-[12.5px] text-destructive">
            Conversation reports could not be loaded.
          </p>
        ) : data.length === 0 ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
            No conversation reports have been submitted.
          </p>
        ) : (
          <ul>
            {data.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

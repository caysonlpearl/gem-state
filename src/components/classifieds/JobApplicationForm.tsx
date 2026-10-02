import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  getMyJobApplicationForListing,
  submitJobApplication,
} from "@/lib/job-applications.functions";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  contacted: "Contacted",
  rejected: "Not selected",
};

export function JobApplicationForm({ listingId }: { listingId: string }) {
  const queryClient = useQueryClient();
  const fetchMyApplication = useServerFn(getMyJobApplicationForListing);
  const submit = useServerFn(submitJobApplication);

  const myApplication = useQuery({
    queryKey: ["my-job-application", listingId],
    queryFn: () => fetchMyApplication({ data: { listingId } }),
  });

  const [resume, setResume] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (myApplication.data) setCoverLetter(myApplication.data.coverLetter ?? "");
  }, [myApplication.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!resume && !myApplication.data) throw new Error("Attach a resume to apply.");
      let resumePath = myApplication.data?.resumePath;
      if (resume) {
        if (!ALLOWED_TYPES.includes(resume.type)) {
          throw new Error("Attach a PDF or Word document.");
        }
        if (resume.size > 10 * 1024 * 1024) {
          throw new Error("That resume is larger than 10 MB. Attach a smaller file.");
        }
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        const ext =
          resume.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "pdf";
        const path = `${uid}/${listingId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("job-application-resumes")
          .upload(path, resume, { contentType: resume.type });
        if (error) throw new Error(`Resume upload failed: ${error.message}`);
        resumePath = path;
      }
      if (!resumePath) throw new Error("Attach a resume to apply.");
      return submit({ data: { listingId, resumePath, coverLetter: coverLetter || null } });
    },
    onSuccess: async () => {
      setEditing(false);
      setResume(null);
      await queryClient.invalidateQueries({ queryKey: ["my-job-application", listingId] });
      toast.success("Application sent to the employer.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit your application."),
  });

  if (myApplication.isLoading) return null;

  if (myApplication.data && !editing) {
    return (
      <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-4">
        <p className="text-[13px] font-semibold">
          You applied on {new Date(myApplication.data.createdAt).toLocaleDateString()}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Status: {statusLabels[myApplication.data.status] ?? myApplication.data.status}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-[12px] font-semibold text-primary hover:underline"
        >
          Update your application
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="block text-[12px] font-medium">
        Resume (PDF or Word)
        <input
          type="file"
          required={!myApplication.data}
          accept="application/pdf,.doc,.docx"
          onChange={(event) => setResume(event.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-[12.5px] file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-primary file:px-3 file:text-[12px] file:font-semibold file:text-primary-foreground"
        />
        {myApplication.data && !resume ? (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Leave blank to keep your previously submitted resume.
          </span>
        ) : null}
      </label>
      <label className="block text-[12px] font-medium">
        Cover letter <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          value={coverLetter}
          onChange={(event) => setCoverLetter(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Share your availability and relevant experience…"
          className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-[12.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Submitting…" : "Submit application"}
        </button>
        {myApplication.data ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[12.5px] font-semibold text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

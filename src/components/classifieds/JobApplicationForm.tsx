import { supabase } from "@/integrations/supabase/client";
import { trackCompletedInquiry, trackSellerContact } from "@/lib/analytics";
import {
  getMyJobApplicationForListing,
  submitJobApplication,
} from "@/lib/job-applications.functions";
import { useServerFn } from "@tanstack/react-start";
import { JobApplicationFormView } from "./JobApplicationFormView";
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export function JobApplicationForm({ listingId }: { listingId: string }) {
  const fetchMyApplication = useServerFn(getMyJobApplicationForListing),
    submit = useServerFn(submitJobApplication);
  return (
    <JobApplicationFormView
      listingId={listingId}
      runtime={{
        getApplication: () => fetchMyApplication({ data: { listingId } }),
        onSubmit: async ({ resume, application, coverLetter }) => {
          if (!resume && !application) throw new Error("Attach a resume to apply.");
          let resumePath = application?.resumePath;
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
        onSubmitted: (applicationId) => {
          trackSellerContact("apply", { id: listingId, categorySlug: "jobs" });
          trackCompletedInquiry("apply", applicationId, { id: listingId, categorySlug: "jobs" });
        },
      }}
    />
  );
}

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JobApplicationStatus = "submitted" | "reviewed" | "contacted" | "rejected";

export type MyJobApplication = {
  id: string;
  status: JobApplicationStatus;
  coverLetter: string | null;
  resumePath: string;
  createdAt: string;
  updatedAt: string;
};

export const submitJobApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { listingId: string; resumePath: string; coverLetter?: string | null }) => {
      const coverLetter = String(input.coverLetter ?? "").trim();
      if (coverLetter.length > 4000) throw new Error("Keep your cover letter under 4000 characters.");
      return {
        listingId: String(input.listingId),
        resumePath: String(input.resumePath),
        coverLetter: coverLetter || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: applicationId, error } = await client.rpc("submit_job_application", {
      _listing_id: data.listingId,
      _resume_path: data.resumePath,
      ...(data.coverLetter ? { _cover_letter: data.coverLetter } : {}),
    });
    if (error) throw new Error(error.message);
    const { emailJobApplicationReceived } = await import("./email-notifications.server");
    await emailJobApplicationReceived(applicationId as string);
    return { ok: true as const };
  });

export const getMyJobApplicationForListing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listingId: string }) => ({ listingId: String(input.listingId) }))
  .handler(async ({ data, context }): Promise<MyJobApplication | null> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("job_applications")
      .select("id,status,cover_letter,resume_path,created_at,updated_at")
      .eq("listing_id", data.listingId)
      .eq("applicant_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      coverLetter: row.cover_letter,
      resumePath: row.resume_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

export type SellerJobApplication = {
  id: string;
  listingId: string;
  listingTitle: string;
  applicantName: string;
  coverLetter: string | null;
  status: JobApplicationStatus;
  createdAt: string;
};

export const getSellerJobApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SellerJobApplication[]> => {
    const client = context.supabase as any;
    // RLS already scopes this to applications on listings the caller owns as
    // seller, so this can safely go through the caller's own client.
    const { data: applications, error } = await client
      .from("job_applications")
      .select("id,listing_id,applicant_id,cover_letter,status,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!applications?.length) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const listingIds = [...new Set(applications.map((a: any) => a.listing_id))];
    const applicantIds = [...new Set(applications.map((a: any) => a.applicant_id))];
    const [{ data: listings }, { data: profiles }] = await Promise.all([
      admin.from("asks").select("id,products(name)").in("id", listingIds),
      admin.from("profiles").select("id,display_name").in("id", applicantIds),
    ]);
    const titleById = new Map(
      (listings ?? []).map((l: any) => [l.id, l.products?.name ?? "Job listing"]),
    );
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    return applications.map((application: any) => ({
      id: application.id,
      listingId: application.listing_id,
      listingTitle: titleById.get(application.listing_id) ?? "Job listing",
      applicantName: nameById.get(application.applicant_id) ?? "Gem State member",
      coverLetter: application.cover_letter,
      status: application.status,
      createdAt: application.created_at,
    }));
  });

export const updateJobApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { applicationId: string; status: JobApplicationStatus }) => {
    const statuses: JobApplicationStatus[] = ["submitted", "reviewed", "contacted", "rejected"];
    if (!statuses.includes(input.status)) throw new Error("Invalid application status.");
    return { applicationId: String(input.applicationId), status: input.status };
  })
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.rpc("update_job_application_status", {
      _application_id: data.applicationId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Signed URL to a job applicant's private resume, opened only through this
 * audited channel. RLS on job_applications already restricts the caller to
 * either the applicant or the listing's seller before this can succeed. */
export const getJobApplicationResumeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { applicationId: string }) => ({
    applicationId: String(input.applicationId),
  }))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("job_applications")
      .select("resume_path")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Application not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("job-application-resumes")
      .createSignedUrl(row.resume_path, 120);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Could not open this resume.");
    return { url: signed.data.signedUrl };
  });

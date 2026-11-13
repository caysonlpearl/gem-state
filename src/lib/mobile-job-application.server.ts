/* eslint-disable @typescript-eslint/no-explicit-any -- authenticated Storage and migration-backed RPC projections */
import { z } from "zod";
import { MobileApiError, mobileJson } from "./mobile-api.ts";
import { mobileWriteId } from "./mobile-write.ts";
import { resumeTypes } from "./mobile-job-application-contract.ts";
export function mobileApplicationAvailable(ready: boolean) {
  if (!ready)
    throw new MobileApiError(
      503,
      "applications_unavailable",
      "Applications are temporarily unavailable. Please try again later.",
    );
}
function requestId(request: Request) {
  const id = mobileWriteId(request.headers.get("Idempotency-Key"));
  if (!id)
    throw new MobileApiError(
      400,
      "invalid_request",
      "This application needs its original retry identifier.",
    );
  return id;
}
export async function prepareMobileResume(
  request: Request,
  client: any,
  user: string,
  listingId: string,
  body?: unknown,
) {
  const input = z
    .object({
      contentType: z.enum(
        Object.keys(resumeTypes) as [keyof typeof resumeTypes, ...(keyof typeof resumeTypes)[]],
      ),
      size: z
        .number()
        .int()
        .min(1)
        .max(10 * 1024 * 1024),
    })
    .strict()
    .parse(body === undefined ? await mobileJson(request) : body);
  const id = requestId(request),
    path = `${user}/${listingId}/${id}.${resumeTypes[input.contentType]}`,
    bucket = client.storage.from("job-application-resumes");
  const info = await bucket.info(path);
  if (info.data) {
    if (info.data.size !== input.size || info.data.contentType !== input.contentType)
      throw new MobileApiError(409, "resume_mismatch", "Retry the original resume upload.");
    return { path, uploaded: true };
  }
  if (
    info.error &&
    !(
      info.error.status === 404 ||
      info.error.statusCode === "404" ||
      info.error.code === "NoSuchKey"
    )
  )
    throw new MobileApiError(
      503,
      "resume_unavailable",
      "The resume upload could not be checked. Please retry.",
    );
  const signed = await bucket.createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token)
    throw new MobileApiError(
      503,
      "resume_unavailable",
      "The resume upload could not be prepared. Please retry.",
    );
  return { path, token: signed.data.token, uploaded: false };
}
export async function commitMobileApplication(
  request: Request,
  client: any,
  listingId: string,
  body?: unknown,
) {
  const input = z
    .object({
      resumePath: z.string().min(1).max(300),
      coverLetter: z.string().trim().max(4000).nullable(),
    })
    .strict()
    .parse(body === undefined ? await mobileJson(request) : body);
  const id = requestId(request);
  const result = await client.rpc("mobile_commit_job_application", {
    _request: id,
    _listing: listingId,
    _resume_path: input.resumePath,
    _cover_letter: input.coverLetter,
  });
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("retry does not match"))
      throw new MobileApiError(409, "retry_mismatch", "Retry your original application request.");
    if (message.includes("Resume"))
      throw new MobileApiError(
        409,
        "resume_unavailable",
        "The resume upload could not be confirmed. Retry the same application.",
      );
    if (message.includes("Application unavailable"))
      throw new MobileApiError(
        404,
        "application_unavailable",
        "This job is not accepting applications in the app.",
      );
    if (/Accept current terms|Account deletion pending/.test(message))
      throw new MobileApiError(
        409,
        "account_action_required",
        "Check your account before applying.",
      );
    throw new MobileApiError(
      503,
      "application_failed",
      "Your application could not be confirmed. Retry the same request.",
    );
  }
  return result.data as { ok: true; applicationId: string; replayed: boolean };
}

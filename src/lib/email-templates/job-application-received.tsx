import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  jobTitle?: string;
  applicantName?: string;
  coverLetter?: string;
}

const Email = ({ jobTitle, applicantName, coverLetter }: Props) => (
  <EmailShell
    preview={`New application for ${jobTitle ?? "your job listing"}`}
    heading="New job application"
    intro={`${applicantName ?? "A member"} applied to ${jobTitle ?? "your job listing"} on Gem State Classifieds. Review their resume and cover letter in your seller dashboard.`}
    facts={[
      { label: "Job listing", value: jobTitle ?? "" },
      { label: "Applicant", value: applicantName ?? "" },
      ...(coverLetter ? [{ label: "Cover letter", value: coverLetter }] : []),
    ]}
    ctaLabel="Review applications"
    ctaPath="/selling#applications"
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["jobTitle"] ? `New application for ${d["jobTitle"]}` : "New job application",
  displayName: "Job application received (employer)",
  previewData: {
    jobTitle: "Front Desk Associate",
    applicantName: "Jordan",
    coverLetter: "I have two years of front desk experience and am available immediately.",
  },
} satisfies TemplateEntry;

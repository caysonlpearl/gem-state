export const resumeTypes = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export function validateMobileResume(file: { type: string; size: number }) {
  if (!Object.hasOwn(resumeTypes, file.type)) throw Error("Attach a PDF or Word document.");
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw Error("Attach a resume up to 10 MB.");
}

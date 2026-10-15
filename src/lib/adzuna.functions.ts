import { createServerFn } from "@tanstack/react-start";
import { adzunaSearchSchema } from "./adzuna-contract";

export const searchAdzunaJobs = createServerFn({ method: "GET" })
  .inputValidator(adzunaSearchSchema)
  .handler(async ({ data }) => {
    const { searchJobs } = await import("./adzuna.server");
    return searchJobs(data);
  });

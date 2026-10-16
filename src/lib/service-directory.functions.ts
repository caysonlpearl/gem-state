import { createServerFn } from "@tanstack/react-start";

/** Local businesses per Services trade, for the category lists. */
export const getServiceTradeCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, number>> => {
    const { directoryTradeCounts } = await import("./service-directory.server");
    return directoryTradeCounts();
  },
);

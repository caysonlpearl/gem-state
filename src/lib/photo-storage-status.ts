export type PhotoReceiptCheck =
  | { receiptsState: "ready"; receiptsReady: true; verifiedCopies: number }
  | {
      receiptsState: "missing" | "unavailable";
      receiptsReady: false;
      verifiedCopies: null;
    };

/** A failed or incomplete count cannot establish that a migration is absent.
 * Even a schema-cache miss describes API availability, not installation history.
 * Never expose raw database errors or report an unknown count as zero. */
export function photoReceiptCheck(result: { count?: unknown; error?: unknown }): PhotoReceiptCheck {
  if (result.error) {
    const code =
      typeof result.error === "object" && "code" in result.error ? result.error.code : undefined;
    return {
      receiptsState: code === "42P01" || code === "PGRST205" ? "missing" : "unavailable",
      receiptsReady: false,
      verifiedCopies: null,
    };
  }
  if (typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0)
    return { receiptsState: "unavailable", receiptsReady: false, verifiedCopies: null };
  return { receiptsState: "ready", receiptsReady: true, verifiedCopies: result.count };
}

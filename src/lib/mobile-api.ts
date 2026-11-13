import { mobileOriginAllowed, type MobileError } from "./mobile-contract.ts";

export class MobileApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function mobileJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new MobileApiError(415, "json_required", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new MobileApiError(400, "invalid_body", "A request body is required.");
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        throw new MobileApiError(413, "body_too_large", "This request is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value;
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError(400, "invalid_body", "This request could not be read.");
  } finally {
    reader.releaseLock();
  }
}
export function createMobileHandler(
  dispatch: (request: Request, path: string) => Promise<unknown>,
  development = false,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin"),
      requestId = crypto.randomUUID();
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      Vary: "Origin",
      "X-Bluebird-API-Version": "1",
      "X-Bluebird-API-Release": "2026-11-13-shopping-rows",
      "Access-Control-Expose-Headers":
        "X-Request-Id, X-Bluebird-API-Version, X-Bluebird-API-Release",
    });
    if (!mobileOriginAllowed(origin, development))
      return Response.json(
        { error: { code: "origin_denied", message: "This origin is not supported." }, requestId },
        { status: 403, headers },
      );
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key, X-Bluebird-Install",
    );
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const path = new URL(request.url).pathname
        .replace(/^\/api\/mobile\/v1\/?/, "")
        .replace(/\/$/, "");
      const data = await dispatch(request, path);
      return Response.json({ data, requestId }, { headers });
    } catch (error) {
      const known = error instanceof MobileApiError;
      const invalid = error instanceof Error && error.name === "ZodError";
      const status = known ? error.status : invalid ? 400 : 503;
      if (!known)
        console.error(
          "mobile_api_failed",
          requestId,
          error instanceof Error ? error.name : "unknown",
          development && error instanceof Error
            ? error.stack?.split("\n").slice(1, 5).join("\n")
            : "",
        );
      const body: MobileError = {
        error: {
          code: known ? error.code : invalid ? "invalid_request" : "temporarily_unavailable",
          message: known
            ? error.message
            : invalid
              ? "Check the information you entered."
              : "Bluebird is temporarily unavailable. Please try again.",
        },
        requestId,
      };
      return Response.json(body, { status, headers });
    }
  };
}

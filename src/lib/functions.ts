import { reportError } from "./errors";

// Every Edge Function call from the browser carries its own x-request-id, so
// the same UUID appears in the browser, the response and the function log.
export const REQUEST_ID_HEADER = "x-request-id";

type InvokeOptions = { method?: "GET" | "POST"; body?: Record<string, unknown> };
type InvokeResult = { data: unknown; error: unknown };
export type FunctionsClient = {
  functions: { invoke: (name: string, options: InvokeOptions & { headers?: Record<string, string> }) => Promise<InvokeResult> };
};

// crypto.randomUUID only exists in secure contexts (HTTPS or localhost).
// Without it the header is omitted and the function generates the id itself.
export function newRequestId(): string | null {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
}

export function errorStatus(error: unknown): number | undefined {
  return (error as { context?: { status?: number } } | null)?.context?.status;
}

export async function invokeFunction<T = unknown>(client: FunctionsClient, name: string, options: InvokeOptions = {}, report: typeof reportError = reportError) {
  const requestId = newRequestId();
  let result: InvokeResult;
  try {
    result = await client.functions.invoke(name, { ...options, ...(requestId ? { headers: { [REQUEST_ID_HEADER]: requestId } } : {}) });
  } catch (error) {
    result = { data: null, error };
  }
  // Only the function name, id and HTTP status: no payloads, tokens or user data.
  if (result.error) {
    const status = errorStatus(result.error);
    console.error(JSON.stringify({ event: "function_error", function: name, requestId, status }));
    // 4xx are expected answers (401, 409...). 5xx and network failures are reported,
    // with the same requestId the function logged, to link both Sentry events.
    if (status === undefined || status >= 500) {
      void report({ message: `${name} falló desde el navegador${status ? ` con ${status}` : " sin respuesta"}`, exceptionType: status ? "HttpError" : "NetworkError",
        tags: { function: name, requestId: requestId ?? undefined, status } });
    }
  }
  return { data: (result.error ? null : result.data) as T | null, error: result.error ?? null, requestId };
}

// Lets a user quote the reference so the matching log line can be found.
export function withReference(message: string, requestId: string | null): string {
  return requestId ? `${message} Referencia: ${requestId}` : message;
}

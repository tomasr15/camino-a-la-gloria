// Correlation id shared by the browser, the response and the JSON log entry.
// A client value is adopted only when it is a canonical UUID, so it cannot
// inject text into logs or headers; anything else gets a server-side id.
// It is a trace reference, not an idempotency key or an authorization token.
export const REQUEST_ID_HEADER = "x-request-id";
export type RequestIdSource = "client" | "server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdFrom(request: Request): { requestId: string; requestIdSource: RequestIdSource } {
  const incoming = request.headers.get(REQUEST_ID_HEADER) ?? "";
  if (UUID.test(incoming)) return { requestId: incoming.toLowerCase(), requestIdSource: "client" };
  return { requestId: crypto.randomUUID(), requestIdSource: "server" };
}

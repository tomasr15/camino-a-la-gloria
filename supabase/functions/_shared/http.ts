export function corsHeaders(request: Request, allowedOrigins: string[]): Headers | null {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return null;
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "x-request-id",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

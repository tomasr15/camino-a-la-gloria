import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : undefined;
const supabaseOrigins = supabaseUrl
  ? [supabaseUrl.origin, `${supabaseUrl.protocol === "http:" ? "ws:" : "wss:"}//${supabaseUrl.host}`]
  : [];
// Next.js inlines its bootstrap and flight-data scripts, so 'unsafe-inline' is required
// even in production. Development additionally needs 'unsafe-eval' for the fast-refresh
// overlay and 'ws:' for the HMR socket.
const scriptSrc = development ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
// Error capture posts events straight to the Sentry ingest host of the DSN
// (the host parseDsn in supabase/functions/_shared/error-report.ts sends to).
function sentryIngestOrigin(dsn: string | undefined): string | null {
  try { return dsn && new URL(dsn).protocol === "https:" ? new URL(dsn).origin : null; } catch { return null; }
}
const sentryOrigin = sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
const connectSrc = [
  "'self'",
  ...supabaseOrigins,
  ...(sentryOrigin ? [sentryOrigin] : []),
  ...(development ? ["ws:", "http:"] : [])
].join(" ");
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // A production build can also use the local HTTP Supabase stack.
  ...(development || supabaseUrl?.protocol === "http:" ? [] : ["upgrade-insecure-requests"])
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
    ] }];
  }
};
export default config;

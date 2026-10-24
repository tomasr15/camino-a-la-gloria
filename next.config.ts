import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
// Next.js inlines its bootstrap and flight-data scripts, so 'unsafe-inline' is required
// even in production. Development additionally needs 'unsafe-eval' for the fast-refresh
// overlay and 'ws:' for the HMR socket.
const scriptSrc = development ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
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
  // Upgrading http subresources would break the local http:// development origin.
  ...(development ? [] : ["upgrade-insecure-requests"])
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

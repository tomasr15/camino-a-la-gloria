import { createReporter, type ErrorEvent as ReportEvent, type Report } from "../../supabase/functions/_shared/error-report";

// Browser side of the error capture. NEXT_PUBLIC_SENTRY_DSN is public by design
// (Sentry DSNs only allow sending events); without it nothing is sent.
let reporter: Report | null = null;
function browserReporter(): Report {
  reporter ??= createReporter({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    runtime: "browser",
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV
  });
  return reporter;
}

export function reportError(event: ReportEvent): Promise<boolean> {
  const path = typeof location === "undefined" ? undefined : location.pathname;
  return browserReporter()({ ...event, tags: { path, ...event.tags } });
}

// Only the error type and a bounded message: no stack, no URL query, no form data.
function describe(value: unknown): { message: string; exceptionType: string } {
  if (value instanceof Error) return { message: value.message || value.name, exceptionType: value.name };
  return { message: typeof value === "string" ? value : "Error no identificado", exceptionType: "UnhandledRejection" };
}

let installed = false;
export function installGlobalErrorCapture(target: Pick<Window, "addEventListener"> = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener("error", event => {
    const { message, exceptionType } = describe(event.error ?? event.message);
    void reportError({ message, exceptionType, tags: { source: "window.onerror" } });
  });
  target.addEventListener("unhandledrejection", event => {
    const { message, exceptionType } = describe(event.reason);
    void reportError({ message, exceptionType, tags: { source: "unhandledrejection" } });
  });
}

export function resetErrorCaptureForTests(): void {
  installed = false;
  reporter = null;
}

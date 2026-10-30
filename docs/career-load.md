# Career API load smoke check

Run `node --experimental-transform-types scripts/career-load.mjs` from the repository root. The script reads Supabase CLI status as JSON, verifies `API_URL` resolves to localhost, and refuses a non-local target. It does not start, stop, reset, or migrate Supabase.

When local Supabase and Edge Functions are already running, the script creates two new synthetic auth users, creates one career per user, and initializes one game per career. It leaves these test accounts and records in the local database. It then sends exactly 40 authenticated GET requests (20 to `careers`, 20 to `game`) with at most two requests in flight. No narrative endpoint or AI provider is called.

The report includes per-request status, latency, and synthetic request ID; p50/p95/max latency; error rate; and the two pass/fail thresholds (p95 under 2,000 ms and error rate under 1%). Reports are written to `docs/evidencias/career-load-YYYY-MM-DD.json` and `docs/evidencias/career-load-latest.json`. Credentials, tokens, passwords, and account emails are never written to evidence or printed.

This is a bounded smoke measurement with two users and 40 reads, not a capacity or production load test. Timings include local network and function startup effects in the current environment.

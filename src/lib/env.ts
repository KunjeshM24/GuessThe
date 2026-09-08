/**
 * Public environment. Everything here is inlined into the client bundle by
 * Next, so it must contain only genuinely public values.
 *
 * Secrets live in `env.server.ts`, which is import-guarded by `server-only`.
 *
 * Next replaces literal `process.env.NEXT_PUBLIC_X` reads at build time, so
 * these must be written out in full — never `process.env[name]`.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * Absolute base URL, used for the link appended to share cards. Optional: the
 * domain is still an open decision (GamePlan.md Section 10), so it falls back
 * to localhost rather than failing the build.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export { required };

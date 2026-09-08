import "server-only";

import { required } from "./env";

/**
 * Server-only environment. `server-only` makes importing this from a Client
 * Component a build error, so these values can never reach the browser
 * bundle.
 *
 * The service-role key bypasses Row Level Security entirely — use it only in
 * server code that has already authorised the caller itself.
 */
export const SUPABASE_SERVICE_ROLE_KEY = required(
  "SUPABASE_SERVICE_ROLE_KEY",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Show packs that are not yet `is_live`.
 *
 * Production shows only live packs — that is the whole point of the flag. This
 * exists so the packs can be reviewed and played end to end *before* they are
 * flipped, without having to flip them.
 *
 * Server-only and deliberately not `NEXT_PUBLIC_`: a browser has no business
 * being able to ask for unlaunched content, and a public flag would ship into
 * the bundle where anyone could read that it exists.
 *
 * Set `PREVIEW_UNLISTED_PACKS=1` in `.env.local`. Never set it in production.
 */
export const PREVIEW_UNLISTED_PACKS =
  process.env.PREVIEW_UNLISTED_PACKS === "1" ||
  process.env.PREVIEW_UNLISTED_PACKS === "true";

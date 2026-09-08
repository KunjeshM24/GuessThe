import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env.server";

/**
 * Request-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions. Acts as the signed-in user, so RLS still applies.
 *
 * Create a new one per request — never cache or share it across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. Session refresh is handled
          // in proxy.ts instead (see GamePlan.md Section 4).
        }
      },
    },
  });
}

/**
 * Session-free client for public, cacheable reads.
 *
 * Acts as `anon`, so RLS still applies — it simply has no cookies to read.
 * That matters because a cached scope (`unstable_cache`, `use cache`) is not
 * allowed to touch `cookies()` at all, which rules out `createClient()` above.
 *
 * Use this only where the answer genuinely does not depend on who is asking:
 * the leaderboard, and public profile reads.
 */
export function createPublicClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Admin client. **Bypasses Row Level Security completely.**
 *
 * Only for server code that has already authorised the caller, plus the reads
 * RLS deliberately forbids from the client — notably `puzzles`, whose answers
 * must never be reachable with the anon key (GamePlan.md Section 5.5).
 */
export function createAdminClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [] },
    auth: { persistSession: false },
  });
}

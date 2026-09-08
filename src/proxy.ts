import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { packSlugForHost } from "@/lib/host";

/**
 * Two jobs: subdomain routing, and refreshing the Supabase session.
 *
 * ## Subdomain routing (GamePlan.md Section 4)
 *
 * `trees.example.com/` serves the Tree of the Day page; the bare domain serves
 * the hub. The mapping itself is `packSlugForHost` in `src/lib/host.ts`,
 * which is kept separate so it can be unit tested without the Next runtime.
 *
 * Only the *root* path is rewritten. `/leaderboard` and `/u/ada` are shared
 * across every host, so a subdomain is a front door rather than a separate
 * site. That keeps one set of routes and one session.
 *
 * Visibility is deliberately NOT decided here. The proxy runs on every request
 * including static-ish ones, and asking the database whether a pack is live
 * would put a query in front of the whole site. `/play/[pack]` does that check
 * itself, so an unlaunched subdomain 404s at the page rather than the edge.
 *
 * ## Session refresh
 *
 * Server Components cannot set cookies, so a rotated refresh token has nowhere
 * to land unless something upstream writes it. That something is this file —
 * without it sessions expire mid-visit and users get logged out at random.
 *
 * Note: Next 16 renamed `middleware.ts` to `proxy.ts`; same file convention.
 */

export async function proxy(request: NextRequest) {
  // x-forwarded-host is what a proxy in front of the app sets; Vercel
  // overwrites it, so it is the more trustworthy of the two when present.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const packSlug = packSlugForHost(host);

  // Rewrite the subdomain's front page only. Deeper paths already address
  // themselves and must not be redirected under a pack.
  const rewriteTo =
    packSlug && request.nextUrl.pathname === "/"
      ? new URL(`/play/${packSlug}`, request.url)
      : null;

  const makeResponse = () =>
    rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request })
      : NextResponse.next({ request });

  let response = makeResponse();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, responseHeaders) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Rebuilt, not mutated: the response has to carry the updated request
        // cookies, and it has to stay a rewrite if this is a pack subdomain.
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must not be cached by a CDN, or one
        // user's session token can be served to somebody else.
        for (const [key, value] of Object.entries(responseHeaders)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Touching the user is what triggers the refresh. Do not remove.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

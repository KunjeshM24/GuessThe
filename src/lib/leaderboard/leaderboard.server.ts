import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/server";

import { LEADERBOARD_LIMIT } from "./types";
import type { LeaderboardRow, LeaderboardScope } from "./types";

/**
 * Leaderboard reads (GamePlan.md Section 5.4).
 *
 * Goes through the `leaderboard()` function with the ordinary anon key, not
 * the admin client — same reasoning as the profile page. The function returns
 * username and avatar only, so there is no private field to leak even if a
 * caller asked for one.
 *
 * ## Caching
 *
 * Both boards are cached for a minute. The daily board is the one people
 * refresh, and recomputing a full ranking on every request is the expensive
 * part; a minute is short enough that a solve shows up while you are still
 * looking at the page, and long enough to flatten a burst.
 *
 * `unstable_cache` rather than the newer `use cache` directive: the latter
 * requires turning on `cacheComponents` in next.config, which changes caching
 * behaviour across the entire app. That is a large blast radius for one page.
 * Revisit when the app moves to Cache Components wholesale.
 */
const CACHE_SECONDS = 60;

async function fetchLeaderboard(
  scope: LeaderboardScope,
  pack: string | null,
): Promise<LeaderboardRow[]> {
  // Session-free on purpose: a cached scope cannot read cookies.
  const { data, error } = await createPublicClient().rpc("leaderboard", {
    p_scope: scope,
    p_pack: pack,
    p_limit: LEADERBOARD_LIMIT,
  });

  if (error || !data) return [];
  return data as LeaderboardRow[];
}

export async function getLeaderboard(
  scope: LeaderboardScope,
  pack: string | null,
): Promise<LeaderboardRow[]> {
  // The cache key has to include both arguments, or every filter combination
  // would serve whichever one was fetched first.
  const cached = unstable_cache(
    () => fetchLeaderboard(scope, pack),
    ["leaderboard", scope, pack ?? "combined"],
    { revalidate: CACHE_SECONDS, tags: ["leaderboard"] },
  );

  return cached();
}

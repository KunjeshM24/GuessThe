import "server-only";

import { createClient } from "@/lib/supabase/server";

import { ACTIVITY_PAGE_SIZE } from "./types";
import type { ActivityEntry, ProfileSummary, StreakSummary } from "./types";

/**
 * Reads for the public profile page.
 *
 * Both calls go through `security definer` functions defined in
 * 20260911000000_profile_queries.sql, using the ordinary *anon-key* client —
 * never the admin client. Those functions are the only thing crossing the
 * per-user RLS boundary, and they return a fixed column list that cannot
 * include an email. Using `createAdminClient()` here would work and would be
 * a much worse idea: one careless `select("*")` later and the boundary is gone.
 */

/** Null when no such username exists, so the route can 404. */
export async function getProfileSummary(username: string): Promise<ProfileSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_summary", { p_username: username });

  if (error || !data) return null;
  return data as ProfileSummary;
}

export async function getProfileActivity(
  username: string,
  offset = 0,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_activity", {
    p_username: username,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data) return [];
  return data as ActivityEntry[];
}

/** The combined all-packs streak — the `pack_id IS NULL` row. */
export function combinedStreak(streaks: StreakSummary[]): StreakSummary | null {
  return streaks.find((s) => s.packSlug === null) ?? null;
}

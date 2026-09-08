import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in viewer's own headline numbers, for the hub homepage.
 *
 * Read through the *user-scoped* client, so the existing own-row RLS policies
 * on `streaks` and `solves` are what limit it — there is no `security definer`
 * function here and no admin client, because nobody is reading anybody else's
 * data. That is the whole privacy story: a viewer sees their own totals and
 * the query cannot reach further.
 *
 * Columns are listed explicitly rather than `select("*")`, so a column added
 * to `users` or `streaks` later cannot start arriving on the homepage by
 * accident.
 */
export type ViewerSummary = {
  currentStreak: number;
  longestStreak: number;
  totalSolved: number;
};

/** Null when the viewer has never finished a puzzle — the hub then says nothing. */
export async function getViewerSummary(userId: string): Promise<ViewerSummary | null> {
  try {
    const supabase = await createClient();

    const [{ data: streak }, { count }] = await Promise.all([
      supabase
        .from("streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", userId)
        .is("pack_id", null)
        .maybeSingle(),
      supabase
        .from("solves")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("won", true),
    ]);

    const totalSolved = count ?? 0;
    const currentStreak = streak?.current_streak ?? 0;
    const longestStreak = streak?.longest_streak ?? 0;

    if (totalSolved === 0 && currentStreak === 0 && longestStreak === 0) return null;

    return { currentStreak, longestStreak, totalSolved };
  } catch {
    // The hub must render for everyone; a stats blip just hides the card.
    return null;
  }
}

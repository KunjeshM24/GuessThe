import "server-only";

import { awardBadges } from "@/lib/badges/award.server";
import { applyResult, clampStreak, EMPTY_STREAK, mergeStreaks } from "@/lib/engine/streak";
import type { LocalStreaks, StreakRecord } from "@/lib/engine/streak";
import { getPackIds, getPublishedPuzzleCount } from "@/lib/engine/puzzle";
import type { Puzzle, PublicGameState } from "@/lib/engine/types";
import { createClient } from "@/lib/supabase/server";
import { isPackSlug } from "@/packs/registry";

/**
 * Durable streaks for signed-in players. Anonymous players keep theirs in
 * localStorage (`lib/engine/local-state.ts`); both sides run the same pure
 * functions from `lib/engine/streak.ts`, so the two never drift apart.
 *
 * Every write here goes through the *user-scoped* client, never the admin
 * one, so Row Level Security is the thing enforcing that a player can only
 * touch their own rows — not a `where user_id = ...` this file remembers to
 * add.
 */

type StreakRow = {
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
};

const toRecord = (row: StreakRow | null | undefined): StreakRecord =>
  row
    ? {
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        lastPlayedDate: row.last_played_date,
      }
    : EMPTY_STREAK;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readStreakRow(
  supabase: Supabase,
  userId: string,
  packId: string | null,
): Promise<StreakRecord> {
  const query = supabase
    .from("streaks")
    .select("current_streak, longest_streak, last_played_date")
    .eq("user_id", userId);

  const { data } = await (packId === null
    ? query.is("pack_id", null)
    : query.eq("pack_id", packId)
  ).maybeSingle();

  return toRecord(data);
}

async function writeStreakRow(
  supabase: Supabase,
  userId: string,
  packId: string | null,
  record: StreakRecord,
): Promise<void> {
  await supabase.from("streaks").upsert(
    {
      user_id: userId,
      pack_id: packId,
      current_streak: record.currentStreak,
      longest_streak: record.longestStreak,
      last_played_date: record.lastPlayedDate,
    },
    // Matches the streaks_user_pack_unique constraint, which is NULLS NOT
    // DISTINCT so the combined row (pack_id IS NULL) upserts like any other.
    { onConflict: "user_id,pack_id" },
  );
}

/**
 * Record a finished puzzle for a signed-in player: one `solves` row, then the
 * pack streak and the combined streak.
 *
 * No-ops for anonymous players. Called from the guess action once the *server*
 * has concluded the game is over, so the win/lose it stores is the server's
 * verdict, never the client's claim.
 */
export async function recordFinishedPuzzle(
  packSlug: string,
  puzzle: Puzzle,
  state: PublicGameState,
): Promise<void> {
  if (state.status === "playing") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const won = state.status === "won";

  // The unique constraint on (user_id, puzzle_id) is the idempotency key: a
  // refresh re-submits the finished game, and this returns no rows the second
  // time, so the streak update below is skipped.
  const { data: inserted } = await supabase
    .from("solves")
    .upsert(
      {
        user_id: user.id,
        puzzle_id: puzzle.id,
        guesses_used: state.guesses.length,
        won,
      },
      { onConflict: "user_id,puzzle_id", ignoreDuplicates: true },
    )
    .select("id");

  if (!inserted || inserted.length === 0) return;

  const packId = (await getPackIds()).get(packSlug);
  if (!packId) return;

  const packStreak = await readStreakRow(supabase, user.id, packId);
  await writeStreakRow(
    supabase,
    user.id,
    packId,
    applyResult(packStreak, puzzle.date, won),
  );

  // A loss in one pack must not break the combined streak while another pack
  // could still be won today — so only wins touch it. Mirrors recordResult()
  // in local-state.ts exactly.
  if (won) {
    const combined = await readStreakRow(supabase, user.id, null);
    await writeStreakRow(
      supabase,
      user.id,
      null,
      applyResult(combined, puzzle.date, true),
    );
  }

  // Badges last, so they see the streak this solve just produced. Awarding is
  // best-effort: the solve and the streak are already committed, and a badge
  // that fails here is picked up by the next solve or by `npm run badges`.
  // Never let it throw away a result the player earned.
  try {
    await awardBadges(user.id);
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Fold a device's anonymous streaks into the signed-in account
 * (GamePlan.md Section 5.2).
 *
 * Merge rule and its reasoning live on `mergeStreaks`. Safe to call more than
 * once: the merge is idempotent, so a second run changes nothing.
 */
export async function mergeAnonymousStreaks(
  userId: string,
  local: LocalStreaks,
): Promise<{ merged: number }> {
  const supabase = await createClient();
  const packIds = await getPackIds();
  let merged = 0;

  // Every incoming number is a claim the browser made about itself, so each is
  // capped at how many puzzles that pack has actually published. Caps are
  // derived from the packs that exist, not from what the payload mentions —
  // otherwise an empty `packs` map would drag the combined ceiling to zero.
  const caps = new Map<string, number>();
  for (const [slug, packId] of packIds) {
    caps.set(slug, await getPublishedPuzzleCount(packId));
  }

  for (const [slug, record] of Object.entries(local.packs)) {
    if (!isPackSlug(slug)) continue;
    const packId = packIds.get(slug);
    if (!packId || !record.lastPlayedDate) continue;

    const existing = await readStreakRow(supabase, userId, packId);
    await writeStreakRow(
      supabase,
      userId,
      packId,
      mergeStreaks(existing, clampStreak(record, caps.get(slug) ?? 0)),
    );
    merged += 1;
  }

  if (local.combined.lastPlayedDate) {
    // The combined streak counts days on which *any* pack was won, so its
    // ceiling is the longest-running pack — not the sum of them.
    const combinedCap = Math.max(0, ...caps.values());

    const existing = await readStreakRow(supabase, userId, null);
    await writeStreakRow(
      supabase,
      userId,
      null,
      mergeStreaks(existing, clampStreak(local.combined, combinedCap)),
    );
    merged += 1;
  }

  return { merged };
}

import { isIsoDate } from "./date.ts";
import { addDaysUtc } from "./date.ts";

/**
 * Streak arithmetic, kept pure and storage-free so it can be tested, and so
 * the same function serves both the anonymous localStorage streaks (roadmap
 * step 4) and the authenticated `streaks` rows (roadmap step 5).
 *
 * Field names deliberately mirror the `streaks` columns
 * (current_streak, longest_streak, last_played_date) — migrating an anonymous
 * streak into an account is a field rename, not a reshape.
 */
export type StreakRecord = {
  currentStreak: number;
  longestStreak: number;
  /** YYYY-MM-DD, UTC. Null before the first completed puzzle. */
  lastPlayedDate: string | null;
};

export const EMPTY_STREAK: StreakRecord = {
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
};

/**
 * Fold one finished puzzle into a streak.
 *
 * A streak counts consecutive days **won**, matching what players expect from
 * the genre — losing breaks it. `lastPlayedDate` advances on any completed
 * puzzle, won or lost, which makes this idempotent: replaying the same day
 * (a page refresh, a second pack) cannot inflate the count.
 */
export function applyResult(
  record: StreakRecord,
  date: string,
  won: boolean,
): StreakRecord {
  if (record.lastPlayedDate === date) return record;

  const continues = won && record.lastPlayedDate === addDaysUtc(date, -1);
  const currentStreak = won ? (continues ? record.currentStreak + 1 : 1) : 0;

  return {
    currentStreak,
    longestStreak: Math.max(record.longestStreak, currentStreak),
    lastPlayedDate: date,
  };
}

/**
 * Merge an anonymous device streak into an account's streak
 * (GamePlan.md Section 5.2 — "anonymous streak data migrates into the account
 * on signup").
 *
 * Neither side has the solve history needed to reconstruct the truth exactly,
 * so the rule is chosen to **never inflate**: badges and the leaderboard read
 * these numbers, and a streak invented by a merge would be unearnable
 * otherwise. Under-crediting annoys one player; over-crediting corrupts a
 * shared ranking.
 *
 *   longestStreak   max of both, always — it is a historical high-water mark
 *                   and cannot be double-counted.
 *   lastPlayedDate  the later of the two.
 *   currentStreak   the value belonging to the later `lastPlayedDate`, because
 *                   a current streak only means anything relative to the day
 *                   it last advanced. A 40-day streak that ended in March is
 *                   dead; a 2-day streak that ended yesterday is alive.
 *
 * One exception, the only case where chaining is provably safe: if the later
 * record covers exactly one day (`currentStreak === 1`) and that day is the
 * day immediately after the earlier record's last, the two cannot overlap, so
 * they join — 40 days ending yesterday plus today is 41, not 1.
 *
 * Ties on `lastPlayedDate` take the larger `currentStreak`, on the grounds
 * that the same day was played on both devices and the longer run is the more
 * complete history.
 *
 * The result is idempotent: merging the same pair again returns it unchanged.
 */
export function mergeStreaks(a: StreakRecord, b: StreakRecord): StreakRecord {
  if (!a.lastPlayedDate) return b;
  if (!b.lastPlayedDate) return a;

  const [older, newer] =
    a.lastPlayedDate <= b.lastPlayedDate ? [a, b] : [b, a];

  let currentStreak: number;
  if (older.lastPlayedDate === newer.lastPlayedDate) {
    currentStreak = Math.max(older.currentStreak, newer.currentStreak);
  } else if (
    newer.currentStreak === 1 &&
    newer.lastPlayedDate === addDaysUtc(older.lastPlayedDate!, 1)
  ) {
    currentStreak = older.currentStreak + 1;
  } else {
    currentStreak = newer.currentStreak;
  }

  return {
    currentStreak,
    longestStreak: Math.max(a.longestStreak, b.longestStreak, currentStreak),
    lastPlayedDate: newer.lastPlayedDate,
  };
}

/**
 * A device's anonymous streaks: one record per pack, plus the combined
 * all-packs record that becomes the `streaks` row with `pack_id IS NULL`.
 */
export type LocalStreaks = {
  version: 1;
  /** Keyed by pack slug. */
  packs: Record<string, StreakRecord>;
  combined: StreakRecord;
};

/** Bounds the work a hostile payload can cause; nobody has 20 live packs. */
const MAX_PACK_ENTRIES = 20;

function parseRecord(input: unknown): StreakRecord | null {
  if (!input || typeof input !== "object") return null;
  const { currentStreak, longestStreak, lastPlayedDate } = input as Record<string, unknown>;

  const valid = (n: unknown) =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000;

  if (!valid(currentStreak) || !valid(longestStreak)) return null;
  if (lastPlayedDate !== null && !isIsoDate(lastPlayedDate)) return null;

  return {
    currentStreak: currentStreak as number,
    longestStreak: Math.max(longestStreak as number, currentStreak as number),
    lastPlayedDate: lastPlayedDate as string | null,
  };
}

/**
 * Validate a `LocalStreaks` blob arriving from a browser.
 *
 * This is localStorage — the player can edit it freely, so treat it exactly
 * like any other untrusted request body (GamePlan.md Section 5.5). Returns
 * null rather than throwing so the caller can decide how loud to be.
 *
 * Note this only checks *shape*. The numbers are still claims; `clampStreak`
 * bounds them against how many puzzles actually exist.
 */
export function parseLocalStreaks(input: unknown): LocalStreaks | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1) return null;

  const combined = parseRecord(raw.combined);
  if (!combined) return null;

  if (!raw.packs || typeof raw.packs !== "object") return null;
  const entries = Object.entries(raw.packs as Record<string, unknown>);
  if (entries.length > MAX_PACK_ENTRIES) return null;

  const packs: Record<string, StreakRecord> = {};
  for (const [slug, value] of entries) {
    const record = parseRecord(value);
    if (!record) return null;
    packs[slug] = record;
  }

  return { version: 1, packs, combined };
}

/**
 * Cap a claimed streak at the number of days it could possibly have run for.
 *
 * A localStorage streak is a number the player's own browser wrote, and after
 * the merge it feeds badges and the leaderboard. A pack that has published 12
 * puzzles cannot have been played on 400 consecutive days, so anything above
 * that is either a corrupted blob or someone editing devtools. Clamping rather
 * than rejecting keeps an honest-but-slightly-off streak intact.
 */
export function clampStreak(record: StreakRecord, maxDays: number): StreakRecord {
  const cap = Math.max(0, maxDays);
  if (record.currentStreak <= cap && record.longestStreak <= cap) return record;

  return {
    currentStreak: Math.min(record.currentStreak, cap),
    longestStreak: Math.min(record.longestStreak, cap),
    lastPlayedDate: record.lastPlayedDate,
  };
}

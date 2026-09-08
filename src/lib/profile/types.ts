/**
 * Profile shapes and constants shared by server and client code.
 *
 * Kept out of `profile.server.ts` deliberately: that module is guarded by
 * `server-only`, so a Client Component importing a *value* from it (a page
 * size, a length cap) would fail the build. Types alone would be fine — they
 * are erased — but constants are not.
 */

export type ProfileHeader = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string;
};

export type PackTotal = {
  slug: string;
  name: string;
  solved: number;
  played: number;
};

export type StreakSummary = {
  /** Null for the combined all-packs row (`pack_id IS NULL`). */
  packSlug: string | null;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
};

export type EarnedBadge = {
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  earnedAt: string;
};

export type ActivityEntry = {
  packSlug: string;
  packName: string;
  /** The puzzle's game day, YYYY-MM-DD UTC. */
  day: string;
  guessesUsed: number;
  won: boolean;
  solvedAt: string;
};

export type ProfileSummary = {
  profile: ProfileHeader;
  packs: PackTotal[];
  heatmap: { day: string; packs: number }[];
  streaks: StreakSummary[];
  badges: EarnedBadge[];
  totalActiveDays: number;
  totalSolved: number;
  rank: number | null;
  rankedPlayers: number;
  livePackCount: number;
};

export const ACTIVITY_PAGE_SIZE = 20;

/** Matches the users_bio_length CHECK, which is the real backstop. */
export const MAX_BIO_LENGTH = 300;

/**
 * Reduce an activity row to exactly the fields the browser may see.
 *
 * `<ActivityFeed>` is a Client Component, so whatever object it is handed is
 * serialised wholesale into the RSC payload — every property, including ones
 * nothing renders. The SQL function is the primary control and selects a safe
 * column list, but this is the backstop: a future column added to
 * `profile_activity` cannot reach the browser just because someone forgot
 * this boundary exists.
 *
 * Verified rather than assumed — planting `email` on these rows put it in the
 * page source 20 times before this existed.
 */
export function toPublicActivity(entry: ActivityEntry): ActivityEntry {
  return {
    packSlug: entry.packSlug,
    packName: entry.packName,
    day: entry.day,
    guessesUsed: entry.guessesUsed,
    won: entry.won,
    solvedAt: entry.solvedAt,
  };
}

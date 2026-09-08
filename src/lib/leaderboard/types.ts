export const LEADERBOARD_SCOPES = ["daily", "all-time"] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export type LeaderboardRow = {
  rank: number;
  username: string;
  avatarUrl: string | null;
  /** All-time: puzzles won. Daily: packs solved today. */
  solved: number;
  /** Total guesses used today. Null on the all-time board. */
  guesses: number | null;
};

export const LEADERBOARD_LIMIT = 50;

export function isLeaderboardScope(value: unknown): value is LeaderboardScope {
  return (LEADERBOARD_SCOPES as readonly unknown[]).includes(value);
}

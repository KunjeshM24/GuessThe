/**
 * Turns a raw rank into something worth showing (GamePlan.md Section 5.3).
 *
 * The ranking itself is deliberately simple — total puzzles won — and
 * GamePlan.md Section 10 leaves the formula open to refine once there is real
 * usage data. This only decides how it reads.
 */
export type RankSummary =
  | { kind: "unranked" }
  | { kind: "only-player"; rank: 1 }
  | { kind: "ranked"; rank: number; players: number; topPercent: number };

export function summariseRank(
  rank: number | null,
  players: number,
  totalSolved: number,
): RankSummary {
  // Nobody is ranked until they have actually solved something — otherwise
  // every new signup lands in a meaningless tie for last place.
  if (!rank || players < 1 || totalSolved < 1) return { kind: "unranked" };

  // "Top 100%" is a silly thing to tell the only person playing.
  if (players < 2) return { kind: "only-player", rank: 1 };

  return {
    kind: "ranked",
    rank,
    players,
    // Ceil, floored at 1: the best player is "top 1%", never "top 0%".
    topPercent: Math.min(100, Math.max(1, Math.ceil((rank / players) * 100))),
  };
}

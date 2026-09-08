import { PACKS } from "../../packs/registry.ts";

/**
 * The badge catalogue (GamePlan.md Section 5.3).
 *
 * ## Adding a badge
 *
 * Append one object to `BADGE_RULES` below, then run `npm run badges`. That
 * script upserts the catalogue into the `badges` table and back-fills anyone
 * who already qualifies. Nothing else needs editing — the award service, the
 * profile grid and the backfill all iterate this list.
 *
 * The only constraint is that a rule can read nothing except `BadgeContext`.
 * If a new badge needs a fact that isn't in there, add the field to the
 * context (one query in `badge_context()` in the migration, one field here)
 * and every future rule gets it for free.
 *
 * Rules must be **pure and monotonic**: given the same context they return the
 * same answer, and once true they should stay true. Badges are permanent —
 * nothing in this system ever revokes one — so a rule that can flip back to
 * false just means the badge stops being re-awardable, not that it is removed.
 * That is why the streak rules read `longestStreak` rather than
 * `currentStreak`.
 *
 * Imports here are relative and carry `.ts` extensions so the backfill script
 * can load this file directly under Node without a bundler.
 */

export type BadgeContext = {
  /** Puzzles won, all packs, all time. */
  totalSolved: number;
  /** Puzzles won per pack slug. Missing slug means zero. */
  solvedByPack: Record<string, number>;
  combinedStreak: { currentStreak: number; longestStreak: number };
  /** Pack slugs played (won or lost) in the current UTC week, Monday-based. */
  packsPlayedThisWeek: string[];
  /**
   * Packs that count as "every pack" today. Falls back to all packs before
   * anything is marked live, so the Completionist badge is testable
   * pre-launch — same fallback the profile heatmap uses for its top shade.
   */
  livePackSlugs: string[];
};

export type BadgeRule = {
  slug: string;
  name: string;
  description: string;
  earned: (context: BadgeContext) => boolean;
};

const STREAK_TIERS = [
  { days: 7, name: "Week Runner" },
  { days: 30, name: "Month Runner" },
  { days: 100, name: "Hundred Days" },
  { days: 365, name: "Full Year" },
] as const;

/** Puzzles in one pack before its mastery badge unlocks. */
export const MASTERY_THRESHOLD = 10;

export const BADGE_RULES: readonly BadgeRule[] = [
  {
    slug: "first-solve",
    name: "First Find",
    description: "Solved your first puzzle.",
    earned: (c) => c.totalSolved >= 1,
  },

  ...STREAK_TIERS.map(({ days, name }) => ({
    slug: `streak-${days}`,
    name,
    description: `Kept a combined streak going for ${days} days.`,
    // longestStreak, not currentStreak: reaching the tier once is enough, and
    // breaking a streak later must not un-earn the badge.
    earned: (c: BadgeContext) => c.combinedStreak.longestStreak >= days,
  })),

  ...PACKS.map((pack) => ({
    slug: `mastery-${pack.slug}`,
    name: pack.masteryBadge.name,
    description: pack.masteryBadge.description,
    earned: (c: BadgeContext) => (c.solvedByPack[pack.slug] ?? 0) >= MASTERY_THRESHOLD,
  })),

  {
    slug: "completionist",
    name: "Completionist",
    description: "Played every live pack within the same week.",
    earned: (c) => {
      // Vacuously true with no packs, which would hand this to everybody.
      if (c.livePackSlugs.length === 0) return false;
      const played = new Set(c.packsPlayedThisWeek);
      return c.livePackSlugs.every((slug) => played.has(slug));
    },
  },
];

/** Slugs a context qualifies for, in catalogue order. */
export function earnedBadgeSlugs(context: BadgeContext): string[] {
  return BADGE_RULES.filter((rule) => rule.earned(context)).map((rule) => rule.slug);
}

/**
 * What to insert for a player who already holds `held`.
 *
 * The single decision point shared by the live award path
 * (`award.server.ts`) and the backfill script, so the two cannot drift into
 * disagreeing about who has earned what.
 *
 * Returning only the difference is what stops the backfill re-awarding
 * badges — and re-stamping `earned_at`, which would scramble the "most
 * recently earned" highlight on the profile. The (user_id, badge_id) primary
 * key is the second line of defence, not the first.
 */
export function badgesToAward(
  context: BadgeContext,
  held: Iterable<string>,
): string[] {
  const alreadyHeld = new Set(held);
  return earnedBadgeSlugs(context).filter((slug) => !alreadyHeld.has(slug));
}

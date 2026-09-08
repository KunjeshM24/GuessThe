/**
 * The one bridge between pack-agnostic engine code and pack-specific content.
 *
 * `src/lib/engine/` must never import anything under `src/packs/` except this
 * file. Adding a pack should mean adding an entry here, a content file under
 * `content/packs/`, and a row in the `packs` table — never editing the engine.
 *
 * This is also the seed source for the `packs` table; the DB owns `is_live`
 * and everything downstream of it at runtime.
 *
 * Puzzle content (answers, hints, facts) deliberately does NOT live here — it
 * lives in `content/packs/<slug>.json`, outside `src/`, so that no client
 * component can ever import an answer by accident.
 *
 * Launch scope is these two packs only (GamePlan.md Sections 2 and 3).
 */
export const PACK_SLUGS = ["trees", "objects"] as const;

export type PackSlug = (typeof PACK_SLUGS)[number];

export type Pack = {
  slug: PackSlug;
  name: string;
  description: string;
  /** The thing being guessed, lower case, for UI copy: "Name the tree". */
  noun: string;
  /**
   * Placeholder in the guess field.
   *
   * **Must never name something that is an answer in this pack's content**, or
   * it hands the player the answer on the day it comes up. Same rule for
   * `howToPlay`. Enforced by content/packs/<slug>.test.ts.
   */
  inputPlaceholder: string;
  /** Body of the pack-specific "How to play" modal (GamePlan.md Section 5.1). */
  howToPlay: readonly string[];
  /**
   * Copy for this pack's mastery badge (GamePlan.md Section 5.3). The rule
   * itself is generic and lives in `src/lib/badges/rules.ts`; only the
   * flavour is pack-specific, so only the flavour lives here.
   */
  masteryBadge: { name: string; description: string };
};

export const PACKS: readonly Pack[] = [
  {
    slug: "trees",
    name: "Tree of the Day",
    description: "Name the tree from its bark, leaf and habit.",
    noun: "tree",
    inputPlaceholder: "e.g. Rowan",
    howToPlay: [
      "One tree a day, the same one for everybody, changing at midnight UTC.",
      "You get six guesses. A new clue is pinned to the card after each miss, and the clues get more specific as you go.",
      "Common and scientific names both count, so Rowan and Sorbus aucuparia are equally right.",
      "A guess in the right genus is marked amber — you are close. A guess with nothing in common is marked rust.",
      "Solve it, or run out of guesses, and the specimen is named and filed with a note about it.",
    ],
    masteryBadge: {
      name: "Tree Whisperer",
      description: "Identified 10 trees.",
    },
  },
  {
    slug: "objects",
    name: "Object of the Day",
    description: "Name the everyday object from cropped close-ups.",
    noun: "object",
    inputPlaceholder: "e.g. Doorbell",
    howToPlay: [
      "One object a day, the same one for everybody, changing at midnight UTC.",
      "You get six guesses, and a new clue after each miss.",
      "A guess in the right family of objects is marked amber; an unrelated one is marked rust.",
      "Solve it, or run out of guesses, and the object is named with a note about it.",
    ],
    masteryBadge: {
      name: "Object Oracle",
      description: "Identified 10 everyday objects.",
    },
  },
];

export function isPackSlug(value: string): value is PackSlug {
  return (PACK_SLUGS as readonly string[]).includes(value);
}

export function getPack(slug: PackSlug): Pack {
  const pack = PACKS.find((p) => p.slug === slug);
  if (!pack) throw new Error(`Unknown pack: ${slug}`);
  return pack;
}

import assert from "node:assert/strict";
import test from "node:test";

import { PACK_SLUGS } from "../../packs/registry.ts";
import { BADGE_RULES, badgesToAward, earnedBadgeSlugs, MASTERY_THRESHOLD } from "./rules.ts";
import type { BadgeContext } from "./rules.ts";

const EMPTY: BadgeContext = {
  totalSolved: 0,
  solvedByPack: {},
  combinedStreak: { currentStreak: 0, longestStreak: 0 },
  packsPlayedThisWeek: [],
  livePackSlugs: ["trees", "objects"],
};

const ctx = (over: Partial<BadgeContext>): BadgeContext => ({ ...EMPTY, ...over });

test("badge slugs are unique and stable", () => {
  const slugs = BADGE_RULES.map((rule) => rule.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate badge slug");
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9-]+$/, `${slug} is not a clean slug`);
  }
});

test("the catalogue covers everything GamePlan Section 5.3 asks for", () => {
  const slugs = new Set(BADGE_RULES.map((rule) => rule.slug));
  for (const expected of [
    "first-solve",
    "streak-7",
    "streak-30",
    "streak-100",
    "streak-365",
    "completionist",
  ]) {
    assert.ok(slugs.has(expected), `missing ${expected}`);
  }
  // One mastery badge per pack, generated rather than hand-listed.
  for (const pack of PACK_SLUGS) {
    assert.ok(slugs.has(`mastery-${pack}`), `missing mastery badge for ${pack}`);
  }
});

test("a brand new account earns nothing", () => {
  assert.deepEqual(earnedBadgeSlugs(EMPTY), []);
});

test("the first solve earns exactly one badge", () => {
  assert.deepEqual(
    earnedBadgeSlugs(ctx({ totalSolved: 1, solvedByPack: { trees: 1 } })),
    ["first-solve"],
  );
});

test("streak badges unlock at each tier and keep the earlier ones", () => {
  const at = (longest: number) =>
    earnedBadgeSlugs(ctx({ totalSolved: longest, combinedStreak: { currentStreak: longest, longestStreak: longest } }));

  assert.ok(!at(6).includes("streak-7"));
  assert.ok(at(7).includes("streak-7"));
  assert.ok(!at(7).includes("streak-30"));
  assert.deepEqual(
    at(365).filter((s) => s.startsWith("streak-")),
    ["streak-7", "streak-30", "streak-100", "streak-365"],
  );
});

test("streak badges survive a broken streak", () => {
  // Current streak back to zero, but the tier was reached once.
  const earned = earnedBadgeSlugs(
    ctx({ totalSolved: 40, combinedStreak: { currentStreak: 0, longestStreak: 30 } }),
  );
  assert.ok(earned.includes("streak-7"));
  assert.ok(earned.includes("streak-30"));
});

test("pack mastery needs the threshold in that specific pack", () => {
  const nearly = earnedBadgeSlugs(
    ctx({ totalSolved: 20, solvedByPack: { trees: MASTERY_THRESHOLD - 1, objects: 11 } }),
  );
  assert.ok(!nearly.includes("mastery-trees"));
  assert.ok(nearly.includes("mastery-objects"), "mastery must be per pack, not total");

  const there = earnedBadgeSlugs(
    ctx({ totalSolved: 10, solvedByPack: { trees: MASTERY_THRESHOLD } }),
  );
  assert.ok(there.includes("mastery-trees"));
});

test("completionist needs every live pack in the same week", () => {
  const partial = earnedBadgeSlugs(
    ctx({ totalSolved: 5, packsPlayedThisWeek: ["trees"] }),
  );
  assert.ok(!partial.includes("completionist"));

  const full = earnedBadgeSlugs(
    ctx({ totalSolved: 5, packsPlayedThisWeek: ["trees", "objects"] }),
  );
  assert.ok(full.includes("completionist"));
});

test("completionist ignores packs that are not live", () => {
  // Only trees is live; playing trees alone is a complete week.
  const earned = earnedBadgeSlugs(
    ctx({ totalSolved: 5, livePackSlugs: ["trees"], packsPlayedThisWeek: ["trees"] }),
  );
  assert.ok(earned.includes("completionist"));
});

test("completionist is never awarded when there are no packs at all", () => {
  // Otherwise "played every live pack" is vacuously true and everyone gets it.
  const earned = earnedBadgeSlugs(
    ctx({ totalSolved: 5, livePackSlugs: [], packsPlayedThisWeek: [] }),
  );
  assert.ok(!earned.includes("completionist"));
});

test("rules are pure — evaluating twice gives the same answer", () => {
  const context = ctx({
    totalSolved: 40,
    solvedByPack: { trees: 30, objects: 10 },
    combinedStreak: { currentStreak: 9, longestStreak: 33 },
    packsPlayedThisWeek: ["trees", "objects"],
  });
  const once = earnedBadgeSlugs(context);
  assert.deepEqual(earnedBadgeSlugs(context), once);
  // And evaluating did not mutate the context it was handed.
  assert.deepEqual(context.solvedByPack, { trees: 30, objects: 10 });
});

test("rules are monotonic: more progress never removes a badge", () => {
  const earlier = earnedBadgeSlugs(
    ctx({
      totalSolved: 10,
      solvedByPack: { trees: 10 },
      combinedStreak: { currentStreak: 7, longestStreak: 7 },
      packsPlayedThisWeek: ["trees", "objects"],
    }),
  );
  const later = earnedBadgeSlugs(
    ctx({
      totalSolved: 200,
      solvedByPack: { trees: 150, objects: 50 },
      combinedStreak: { currentStreak: 0, longestStreak: 120 },
      packsPlayedThisWeek: ["trees", "objects"],
    }),
  );

  for (const slug of earlier) {
    assert.ok(later.includes(slug), `${slug} was lost after further progress`);
  }
});

test("a missing pack count reads as zero rather than throwing", () => {
  const earned = earnedBadgeSlugs(ctx({ totalSolved: 3, solvedByPack: {} }));
  assert.ok(earned.includes("first-solve"));
  assert.ok(!earned.some((s) => s.startsWith("mastery-")));
});

test("re-running the backfill awards nothing the second time", () => {
  const context = ctx({
    totalSolved: 12,
    solvedByPack: { trees: 12 },
    combinedStreak: { currentStreak: 8, longestStreak: 8 },
    packsPlayedThisWeek: ["trees", "objects"],
  });

  // First pass: the player holds nothing, so everything they qualify for lands.
  const firstPass = badgesToAward(context, []);
  assert.deepEqual(firstPass.sort(), [
    "completionist",
    "first-solve",
    "mastery-trees",
    "streak-7",
  ]);

  // Second pass over identical data awards nothing — this is the property
  // that makes `npm run badges` safe to run as often as you like.
  assert.deepEqual(badgesToAward(context, firstPass), []);

  // And a third, to be sure it is not merely alternating.
  assert.deepEqual(badgesToAward(context, [...firstPass, ...firstPass]), []);
});

test("a backfill only awards the gap, leaving existing badges untouched", () => {
  const context = ctx({
    totalSolved: 12,
    solvedByPack: { trees: 12 },
    combinedStreak: { currentStreak: 8, longestStreak: 8 },
    packsPlayedThisWeek: [],
  });

  // Player already has the first-solve badge from before the system existed.
  const missing = badgesToAward(context, ["first-solve"]);
  assert.ok(!missing.includes("first-solve"), "would have re-awarded a held badge");
  assert.deepEqual(missing.sort(), ["mastery-trees", "streak-7"]);
});

test("holding a badge you no longer qualify for is left alone", () => {
  // Badges are permanent; nothing here ever revokes one.
  const lapsed = ctx({ totalSolved: 0 });
  assert.deepEqual(badgesToAward(lapsed, ["first-solve", "streak-7"]), []);
});

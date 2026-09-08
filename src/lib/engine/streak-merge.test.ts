import assert from "node:assert/strict";
import test from "node:test";

import {
  clampStreak,
  EMPTY_STREAK,
  mergeStreaks,
  parseLocalStreaks,
} from "./streak.ts";
import type { StreakRecord } from "./streak.ts";

const rec = (
  currentStreak: number,
  longestStreak: number,
  lastPlayedDate: string | null,
): StreakRecord => ({ currentStreak, longestStreak, lastPlayedDate });

test("merging into an untouched account keeps the device's streak whole", () => {
  const local = rec(12, 30, "2026-09-07");
  assert.deepEqual(mergeStreaks(EMPTY_STREAK, local), local);
  assert.deepEqual(mergeStreaks(local, EMPTY_STREAK), local);
});

test("longestStreak is always the high-water mark of both sides", () => {
  const merged = mergeStreaks(rec(2, 40, "2026-09-07"), rec(3, 9, "2026-09-07"));
  assert.equal(merged.longestStreak, 40);
});

test("the later lastPlayedDate decides the current streak", () => {
  // A 40-day run that died in March loses to a 2-day run that is still alive.
  const merged = mergeStreaks(rec(40, 40, "2026-03-01"), rec(2, 2, "2026-09-07"));
  assert.equal(merged.currentStreak, 2);
  assert.equal(merged.longestStreak, 40);
  assert.equal(merged.lastPlayedDate, "2026-09-07");
});

test("a same-day tie takes the longer run", () => {
  const merged = mergeStreaks(rec(9, 9, "2026-09-07"), rec(3, 5, "2026-09-07"));
  assert.equal(merged.currentStreak, 9);
});

test("a single day immediately after the other run chains onto it", () => {
  // 40 days ending yesterday, plus today, is 41 — not 1.
  const merged = mergeStreaks(rec(40, 40, "2026-09-06"), rec(1, 1, "2026-09-07"));
  assert.equal(merged.currentStreak, 41);
  assert.equal(merged.longestStreak, 41);
});

test("chaining is refused when the later run could overlap", () => {
  // The later record covers three days, which already include the earlier
  // record's last day — adding them would invent days that were not played.
  const merged = mergeStreaks(rec(40, 40, "2026-09-06"), rec(3, 3, "2026-09-07"));
  assert.equal(merged.currentStreak, 3);
  assert.equal(merged.longestStreak, 40);
});

test("a gap of more than a day never chains", () => {
  const merged = mergeStreaks(rec(40, 40, "2026-09-01"), rec(1, 1, "2026-09-07"));
  assert.equal(merged.currentStreak, 1);
});

test("a loss on the later day still breaks the streak", () => {
  const merged = mergeStreaks(rec(40, 40, "2026-09-06"), rec(0, 40, "2026-09-07"));
  assert.equal(merged.currentStreak, 0);
  assert.equal(merged.longestStreak, 40);
});

test("merging is order independent and idempotent", () => {
  const a = rec(40, 40, "2026-09-06");
  const b = rec(1, 1, "2026-09-07");

  assert.deepEqual(mergeStreaks(a, b), mergeStreaks(b, a));

  const once = mergeStreaks(a, b);
  assert.deepEqual(mergeStreaks(once, b), once, "second sync changed the streak");
  assert.deepEqual(mergeStreaks(once, a), once);
});

test("merging never invents a streak longer than either side plus one", () => {
  // Property check: the result can only exceed both inputs via the chain rule,
  // which adds exactly one day.
  const dates = ["2026-09-01", "2026-09-05", "2026-09-06", "2026-09-07", null];
  for (const da of dates) {
    for (const db of dates) {
      for (const ca of [0, 1, 3, 40]) {
        for (const cb of [0, 1, 3, 40]) {
          const merged = mergeStreaks(rec(ca, ca, da), rec(cb, cb, db));
          assert.ok(
            merged.currentStreak <= Math.max(ca, cb) + 1,
            `inflated: ${ca}@${da} + ${cb}@${db} -> ${merged.currentStreak}`,
          );
          assert.ok(merged.longestStreak >= merged.currentStreak);
        }
      }
    }
  }
});

test("clampStreak bounds a claim at the puzzles that actually exist", () => {
  assert.deepEqual(clampStreak(rec(400, 400, "2026-09-07"), 12), rec(12, 12, "2026-09-07"));
  // Within the cap, the record is returned untouched.
  const honest = rec(5, 9, "2026-09-07");
  assert.equal(clampStreak(honest, 12), honest);
  assert.deepEqual(clampStreak(rec(5, 5, "2026-09-07"), 0), rec(0, 0, "2026-09-07"));
});

test("parseLocalStreaks accepts a well-formed payload", () => {
  const parsed = parseLocalStreaks({
    version: 1,
    packs: { trees: rec(3, 5, "2026-09-07") },
    combined: rec(3, 5, "2026-09-07"),
  });
  assert.equal(parsed?.packs.trees.currentStreak, 3);
  assert.equal(parsed?.combined.longestStreak, 5);
});

test("parseLocalStreaks rejects anything a hostile browser might send", () => {
  const good = { version: 1, packs: {}, combined: rec(0, 0, null) };

  assert.equal(parseLocalStreaks(null), null);
  assert.equal(parseLocalStreaks("streaks"), null);
  assert.equal(parseLocalStreaks({ ...good, version: 2 }), null);
  assert.equal(parseLocalStreaks({ ...good, packs: "nope" }), null);
  assert.equal(parseLocalStreaks({ ...good, combined: undefined }), null);
  // Non-integer, negative, absurd, and wrong-typed streak counts.
  assert.equal(parseLocalStreaks({ ...good, combined: rec(1.5, 2, null) }), null);
  assert.equal(parseLocalStreaks({ ...good, combined: rec(-1, 2, null) }), null);
  assert.equal(parseLocalStreaks({ ...good, combined: rec(1e9, 1e9, null) }), null);
  assert.equal(
    parseLocalStreaks({ ...good, combined: { currentStreak: "3", longestStreak: 3, lastPlayedDate: null } }),
    null,
  );
  // Bad dates.
  assert.equal(parseLocalStreaks({ ...good, combined: rec(1, 1, "2026-02-30") }), null);
  assert.equal(parseLocalStreaks({ ...good, combined: rec(1, 1, "07/09/2026") }), null);
  // A payload padded out with hundreds of fake packs.
  const manyPacks = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`pack${i}`, rec(1, 1, "2026-09-07")]),
  );
  assert.equal(parseLocalStreaks({ ...good, packs: manyPacks }), null);
});

test("parseLocalStreaks repairs a longest lower than current", () => {
  const parsed = parseLocalStreaks({
    version: 1,
    packs: {},
    combined: rec(9, 2, "2026-09-07"),
  });
  assert.equal(parsed?.combined.longestStreak, 9);
});

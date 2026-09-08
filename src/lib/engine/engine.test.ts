import assert from "node:assert/strict";
import test from "node:test";

import { addDaysUtc, daysBetweenUtc, isIsoDate, isPastGameDay, todayUtc } from "./date.ts";
import { evaluate, gradeGuess, normalize, normalizeGuess, parseGuesses } from "./guess.ts";
import { buildShareText } from "./share.ts";
import { applyResult, EMPTY_STREAK } from "./streak.ts";
import type { StreakRecord } from "./streak.ts";
import { MAX_GUESSES } from "./types.ts";
import type { Puzzle } from "./types.ts";

const puzzle: Puzzle = {
  id: "p1",
  packSlug: "trees",
  packNoun: "tree",
  date: "2026-09-08",
  number: 1,
  answer: "Silver Birch",
  aliases: ["betula pendula", "european white birch"],
  closeTerms: ["birch", "betula"],
  hints: ["hint one", "hint two", "hint three", "hint four", "hint five"],
  fact: "A pioneer species.",
  heroImageUrl: null,
};

/** n distinct guesses that are neither correct nor close. */
const wrong = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `wrong guess ${i}`);

test("normalize folds case, accents, punctuation and a leading article", () => {
  assert.equal(normalize("  The Olive! "), "olive");
  assert.equal(normalize("Jacarandá"), "jacaranda");
  assert.equal(normalize("SILVER   birch"), "silver birch");
  assert.equal(normalize("Platanus × acerifolia"), "platanus acerifolia");
  // The category noun is a pack's business, not the generic normaliser's.
  assert.equal(normalize("Olive Tree"), "olive tree");
});

test("normalizeGuess drops the pack's own noun, and only that pack's", () => {
  assert.equal(normalizeGuess("The Olive Tree!", "tree"), "olive");
  assert.equal(normalizeGuess("Olive", "tree"), "olive");
  // The objects pack does not strip "tree", because "tree" is not its noun.
  assert.equal(normalizeGuess("Olive Tree", "object"), "olive tree");
  assert.equal(normalizeGuess("Tape Measure", "object"), "tape measure");
  // Stripping must never leave nothing behind.
  assert.equal(normalizeGuess("Tree", "tree"), "tree");
});

test("grades exact answers, aliases, near misses and misses", () => {
  assert.equal(gradeGuess(puzzle, "silver birch"), "correct");
  assert.equal(gradeGuess(puzzle, "  SILVER BIRCH  "), "correct");
  assert.equal(gradeGuess(puzzle, "Betula pendula"), "correct");
  assert.equal(gradeGuess(puzzle, "Downy Birch"), "close");
  assert.equal(gradeGuess(puzzle, "English Oak"), "wrong");
  assert.equal(gradeGuess(puzzle, ""), "wrong");
});

test("a close term must match a whole word, not a substring", () => {
  const oak: Puzzle = { ...puzzle, closeTerms: ["oak"] };
  assert.equal(gradeGuess(oak, "Oakley"), "wrong");
  assert.equal(gradeGuess(oak, "Cork Oak"), "close");
});

test("the answer is withheld while the game is still playable", () => {
  for (let n = 0; n < MAX_GUESSES; n += 1) {
    const state = evaluate(puzzle, wrong(n));
    assert.equal(state.status, "playing");
    assert.equal(state.reveal, null, `reveal leaked after ${n} wrong guesses`);
    assert.ok(
      !JSON.stringify(state).toLowerCase().includes("silver birch"),
      `answer text leaked into state after ${n} wrong guesses`,
    );
  }
});

test("hints unlock one at a time and never over-reveal", () => {
  assert.deepEqual(evaluate(puzzle, []).hints, ["hint one"]);
  assert.equal(evaluate(puzzle, wrong(2)).hints.length, 3);
  // Only five hints exist, so a sixth guess cannot conjure a sixth.
  assert.equal(evaluate(puzzle, wrong(5)).hints.length, 5);
  assert.equal(evaluate(puzzle, []).totalHints, 5);
});

test("winning reveals the answer and stops play", () => {
  const state = evaluate(puzzle, ["oak", "silver birch"]);
  assert.equal(state.status, "won");
  assert.equal(state.reveal?.answer, "Silver Birch");
  assert.equal(state.reveal?.fact, "A pioneer species.");
  assert.equal(state.guesses.length, 2);
});

test("guesses sent after a win are discarded, not trusted", () => {
  const state = evaluate(puzzle, ["silver birch", "extra", "extra", "extra"]);
  assert.equal(state.guesses.length, 1);
  assert.equal(state.status, "won");
});

test("running out of guesses loses and reveals", () => {
  const state = evaluate(puzzle, wrong(MAX_GUESSES));
  assert.equal(state.status, "lost");
  assert.equal(state.reveal?.answer, "Silver Birch");
  assert.equal(state.guessesRemaining, 0);
});

test("a client cannot unlock the answer by over-reporting guesses", () => {
  // Even if twenty were somehow smuggled past validation, only MAX_GUESSES grade.
  assert.equal(evaluate(puzzle, wrong(20)).guesses.length, MAX_GUESSES);
  // And validation rejects the oversized array before evaluate() ever sees it.
  assert.equal(parseGuesses(wrong(20)), null);
});

test("parseGuesses rejects anything that is not a short list of short strings", () => {
  assert.deepEqual(parseGuesses(["oak"]), ["oak"]);
  assert.deepEqual(parseGuesses([]), []);
  assert.equal(parseGuesses("oak"), null);
  assert.equal(parseGuesses([1, 2]), null);
  assert.equal(parseGuesses([{}]), null);
  assert.equal(parseGuesses(["x".repeat(61)]), null);
  assert.equal(parseGuesses(null), null);
});

test("share text carries the pattern and never the answer or the guesses", () => {
  const state = evaluate(puzzle, ["oak", "downy birch", "silver birch"]);
  const text = buildShareText({
    packName: "Tree of the Day",
    puzzleNumber: 12,
    state,
    streak: 4,
    url: "https://example.com/play/trees",
  });

  assert.match(text, /^Tree of the Day #12\n/);
  assert.ok(text.includes("\u{1F7EB}\u{1F7E8}\u{1F7E9}"));
  assert.ok(text.includes("3/6"));
  assert.ok(text.includes("\u{1F525} 4"));
  assert.ok(!text.toLowerCase().includes("birch"), "answer leaked into share text");
  assert.ok(!text.toLowerCase().includes("oak"), "guess text leaked into share text");
});

test("a lost game shares as X/6 with no flame", () => {
  const text = buildShareText({
    packName: "Tree of the Day",
    puzzleNumber: 3,
    state: evaluate(puzzle, wrong(MAX_GUESSES)),
    streak: 0,
  });
  assert.ok(text.includes("X/6"));
  assert.ok(!text.includes("\u{1F525}"));
});

test("streaks build on consecutive wins", () => {
  let s = applyResult(EMPTY_STREAK, "2026-09-01", true);
  assert.deepEqual(s, {
    currentStreak: 1,
    longestStreak: 1,
    lastPlayedDate: "2026-09-01",
  });

  s = applyResult(s, "2026-09-02", true);
  s = applyResult(s, "2026-09-03", true);
  assert.equal(s.currentStreak, 3);
  assert.equal(s.longestStreak, 3);
});

test("a loss breaks the streak but keeps the longest", () => {
  const before: StreakRecord = {
    currentStreak: 5,
    longestStreak: 5,
    lastPlayedDate: "2026-09-01",
  };
  const after = applyResult(before, "2026-09-02", false);
  assert.equal(after.currentStreak, 0);
  assert.equal(after.longestStreak, 5);
});

test("a skipped day restarts the streak at one", () => {
  const before: StreakRecord = {
    currentStreak: 5,
    longestStreak: 5,
    lastPlayedDate: "2026-09-01",
  };
  const after = applyResult(before, "2026-09-05", true);
  assert.equal(after.currentStreak, 1);
  assert.equal(after.longestStreak, 5);
});

test("replaying the same day cannot inflate a streak", () => {
  const s = applyResult(EMPTY_STREAK, "2026-09-01", true);
  assert.deepEqual(applyResult(s, "2026-09-01", true), s);
  assert.deepEqual(applyResult(s, "2026-09-01", false), s);
});

test("UTC date helpers round-trip", () => {
  assert.equal(addDaysUtc("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysUtc("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetweenUtc("2026-09-01", "2026-09-08"), 7);
  // 23:59 UTC is still the same game day; local midnight is irrelevant.
  assert.equal(todayUtc(new Date("2026-09-08T23:59:59Z")), "2026-09-08");
  assert.ok(isIsoDate("2026-09-08"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("08/09/2026"));
});

test("only a finished game day counts as past", () => {
  const today = "2026-09-11";

  // Yesterday and earlier are publishable.
  assert.ok(isPastGameDay("2026-09-10", today));
  assert.ok(isPastGameDay("2025-01-01", today));

  // Today is still in play — this is the line that keeps the live answer out
  // of the archive and the sitemap.
  assert.equal(isPastGameDay(today, today), false);

  // Tomorrow and beyond have not started.
  assert.equal(isPastGameDay("2026-09-12", today), false);
  assert.equal(isPastGameDay("2030-01-01", today), false);
});

test("a malformed date is never treated as past", () => {
  const today = "2026-09-11";
  // Fails closed: anything unparseable is withheld rather than published.
  for (const bad of [null, undefined, "", "2026-9-1", "11/09/2026", "2026-02-30", 20260910, {}, "  2026-09-10"]) {
    assert.equal(isPastGameDay(bad, today), false, `${JSON.stringify(bad)} was treated as past`);
  }
});

test("month and year boundaries compare correctly as strings", () => {
  // ISO dates sort lexicographically, which is what the comparison relies on.
  assert.ok(isPastGameDay("2025-12-31", "2026-01-01"));
  assert.equal(isPastGameDay("2026-01-01", "2025-12-31"), false);
  assert.ok(isPastGameDay("2026-08-31", "2026-09-01"));
  assert.equal(isPastGameDay("2026-10-01", "2026-09-30"), false);
});

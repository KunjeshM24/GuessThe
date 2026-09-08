import { MAX_GUESSES } from "./types.ts";
import type { EvaluatedGuess, Feedback, PublicGameState, Puzzle } from "./types.ts";

/** Longest guess the server will look at. Anything longer is rejected. */
export const MAX_GUESS_LENGTH = 60;

/**
 * Fold text onto common ground before comparing: case, accents, punctuation
 * and a leading article all stop mattering. So "L'Olivier" and "the Olive"
 * both land on "olive".
 *
 * Deliberately knows nothing about any pack.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip the accents NFD just split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .trim();
}

/**
 * `normalize`, plus dropping the pack's own category noun when a player has
 * appended it — "Olive Tree" for the tree pack lands on "olive".
 *
 * The noun comes from the pack (`registry.ts`), not from a hard-coded list
 * here: "tree" is meaningful for one pack and meaningless for the next, so
 * baking it into the engine would be exactly the pack-specific leak the
 * engine/pack split exists to prevent.
 *
 * If stripping would leave nothing — a pack whose answer *is* its noun — the
 * unstripped form is kept instead.
 */
export function normalizeGuess(value: string, packNoun: string): string {
  const base = normalize(value);
  const suffix = ` ${normalize(packNoun)}`;

  if (!base.endsWith(suffix)) return base;
  return base.slice(0, -suffix.length).trim() || base;
}

/** True when `term` appears in `normalized` as a whole word (or phrase). */
function containsTerm(normalized: string, term: string): boolean {
  const needle = normalize(term);
  if (!needle) return false;
  return ` ${normalized} `.includes(` ${needle} `);
}

/**
 * Grade one guess. "close" is data-driven via the puzzle's `closeTerms` —
 * the genus for a tree, whatever the near-miss axis is for another pack — so
 * the engine stays pack-agnostic.
 */
export function gradeGuess(puzzle: Puzzle, guess: string): Feedback {
  const fold = (value: string) => normalizeGuess(value, puzzle.packNoun);
  const normalized = fold(guess);
  if (!normalized) return "wrong";

  if (normalized === fold(puzzle.answer)) return "correct";
  if (puzzle.aliases.some((alias) => fold(alias) === normalized)) return "correct";
  if (puzzle.closeTerms.some((term) => containsTerm(normalized, term))) return "close";

  return "wrong";
}

/**
 * The single authority on game state. The server is the only caller: it takes
 * the guesses the client claims to have made, grades them itself, and decides
 * whether the game is over.
 *
 * The answer is attached to the result **only** when this function concludes
 * the game has ended — a client cannot obtain it by asserting a status.
 */
export function evaluate(puzzle: Puzzle, rawGuesses: readonly string[]): PublicGameState {
  const graded: EvaluatedGuess[] = rawGuesses
    .slice(0, MAX_GUESSES)
    .map((text) => ({ text: text.trim(), feedback: gradeGuess(puzzle, text) }));

  // Play stops at the first correct guess; anything the client sent after it
  // is discarded rather than trusted.
  const winIndex = graded.findIndex((g) => g.feedback === "correct");
  const guesses = winIndex === -1 ? graded : graded.slice(0, winIndex + 1);

  const won = winIndex !== -1;
  const lost = !won && guesses.length >= MAX_GUESSES;
  const status = won ? "won" : lost ? "lost" : "playing";

  // One hint up front, then one more for every guess that failed to land.
  const wrongCount = guesses.filter((g) => g.feedback !== "correct").length;
  const revealed = Math.min(puzzle.hints.length, 1 + wrongCount);

  return {
    guesses,
    guessesRemaining: Math.max(0, MAX_GUESSES - guesses.length),
    hints: status === "playing" ? puzzle.hints.slice(0, revealed) : puzzle.hints,
    totalHints: puzzle.hints.length,
    status,
    reveal: status === "playing" ? null : { answer: puzzle.answer, fact: puzzle.fact },
  };
}

/**
 * Validate the guess list a client sent. Never trust its length, its types or
 * its contents (GamePlan.md Section 5.5).
 */
export function parseGuesses(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_GUESSES) return null;
  if (!input.every((g) => typeof g === "string" && g.length <= MAX_GUESS_LENGTH)) {
    return null;
  }
  return input as string[];
}

import { MAX_GUESSES } from "./types.ts";
import type { Feedback, PublicGameState } from "./types.ts";

/**
 * Earth-toned grid rather than the usual green/yellow/black, to match the
 * field-journal palette (GamePlan.md Section 6).
 */
const SQUARE: Record<Feedback, string> = {
  correct: "🟩",
  close: "🟨",
  wrong: "🟫",
};

export type ShareInput = {
  packName: string;
  puzzleNumber: number;
  state: PublicGameState;
  /** Current streak after this result, omitted from the card when 0. */
  streak?: number;
  /** Absolute URL to the pack, appended so a shared card is clickable. */
  url?: string;
};

/**
 * Emoji-grid summary for the clipboard (GamePlan.md Section 5.1).
 *
 * Carries the *pattern* only — never the answer, never the guesses. Pasting a
 * result must not spoil the puzzle for whoever reads it.
 */
export function buildShareText({
  packName,
  puzzleNumber,
  state,
  streak,
  url,
}: ShareInput): string {
  const grid = state.guesses.map((g) => SQUARE[g.feedback]).join("");
  const score = state.status === "won" ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const flame = streak && streak > 0 ? ` · 🔥 ${streak}` : "";

  return [`${packName} #${puzzleNumber}`, grid, `${score}${flame}`, ...(url ? ["", url] : [])]
    .join("\n")
    .trim();
}

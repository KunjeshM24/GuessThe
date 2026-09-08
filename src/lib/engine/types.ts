import type { PackSlug } from "@/packs/registry";

/**
 * Shared engine types. Nothing here is pack-specific: a pack contributes
 * data (answers, hints, close terms) and display copy via the registry, never
 * behaviour.
 */

/** Guesses allowed per puzzle, every pack. */
export const MAX_GUESSES = 6;

export type Feedback = "correct" | "close" | "wrong";

/**
 * A resolved puzzle, including the answer.
 *
 * **This type must never cross the server/client boundary.** Anything sent to
 * the browser is a `PublicGameState`, which only carries the answer once the
 * server has decided the game is over.
 */
export type Puzzle = {
  id: string;
  packSlug: PackSlug;
  /**
   * The pack's category noun ("tree", "object"), carried from the registry so
   * guess matching can drop it when a player appends it. Pack data, not pack
   * logic — the engine never branches on its value.
   */
  packNoun: string;
  /** YYYY-MM-DD, UTC. */
  date: string;
  /** 1-based index within the pack, used for the share card. */
  number: number;
  answer: string;
  aliases: string[];
  closeTerms: string[];
  hints: string[];
  fact: string | null;
  heroImageUrl: string | null;
};

export type EvaluatedGuess = {
  /** The player's guess, echoed back trimmed. */
  text: string;
  feedback: Feedback;
};

export type GameStatus = "playing" | "won" | "lost";

/** Everything the browser is allowed to know about an in-progress game. */
export type PublicGameState = {
  guesses: EvaluatedGuess[];
  guessesRemaining: number;
  /** Only the hints unlocked so far — unrevealed hints never leave the server. */
  hints: string[];
  totalHints: number;
  status: GameStatus;
  /** Null while `status` is "playing". The only channel the answer travels on. */
  reveal: { answer: string; fact: string | null } | null;
};

export type GuessActionResult =
  | { ok: true; state: PublicGameState }
  | { ok: false; error: string };

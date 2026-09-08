"use server";

import { headers } from "next/headers";

import { evaluate, parseGuesses } from "@/lib/engine/guess";
import { getDailyPuzzle } from "@/lib/engine/puzzle";
import type { GuessActionResult } from "@/lib/engine/types";
import { rateLimit } from "@/lib/rate-limit";
import { recordFinishedPuzzle } from "@/lib/streaks.server";
import { isPackSlug } from "@/packs/registry";

/** Comfortably above real play (six guesses a day), low enough to stop scripts. */
const GUESSES_PER_MINUTE = 30;

/**
 * Grade the guesses a player claims to have made, and return only what they
 * are allowed to see.
 *
 * The client holds its own guess list (there are no accounts yet, so there is
 * no server-side place to keep it) and sends the whole list each time. That is
 * safe because this action re-grades every guess itself and decides win/lose
 * on its own terms — the client cannot assert a status, only a list of strings
 * it typed. The answer is attached by `evaluate()` and only once the game is
 * genuinely over.
 */
export async function submitGuesses(
  packSlug: string,
  guesses: unknown,
): Promise<GuessActionResult> {
  if (!isPackSlug(packSlug)) {
    return { ok: false, error: "Unknown pack." };
  }

  const parsed = parseGuesses(guesses);
  if (!parsed) {
    return { ok: false, error: "That guess wasn't something we could read." };
  }

  // Vercel overwrites x-forwarded-for at the edge, so it is trustworthy there.
  // Behind any other proxy, confirm the same before relying on this.
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";

  if (!rateLimit(`guess:${packSlug}:${ip}`, GUESSES_PER_MINUTE, 60_000)) {
    return { ok: false, error: "Slow down a moment, then try again." };
  }

  const resolved = await getDailyPuzzle(packSlug);
  if (!resolved?.puzzle) {
    return { ok: false, error: "No puzzle is set for today." };
  }

  const state = evaluate(resolved.puzzle, parsed);

  // Persist for signed-in players only; anonymous streaks stay in the browser.
  // This runs off the server's own verdict, so a client cannot claim a win.
  // Idempotent — a refresh re-submits the finished game and changes nothing.
  if (state.status !== "playing") {
    await recordFinishedPuzzle(packSlug, resolved.puzzle, state);
  }

  return { ok: true, state };
}

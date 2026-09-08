"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { submitGuesses } from "@/app/play/[pack]/actions";
import { normalizeGuess } from "@/lib/engine/guess";
import {
  readProgress,
  readStreak,
  recordResult,
  subscribeStreaks,
  writeProgress,
} from "@/lib/engine/local-state";
import { buildShareText } from "@/lib/engine/share";
import { MAX_GUESSES } from "@/lib/engine/types";
import type { Feedback, PublicGameState } from "@/lib/engine/types";
import { MAX_GUESS_LENGTH } from "@/lib/engine/guess";

const STUB: Record<Feedback, { bar: string; label: string; tone: string }> = {
  correct: { bar: "bg-moss", label: "Correct", tone: "text-moss" },
  close: { bar: "bg-ochre", label: "Close", tone: "text-ochre" },
  wrong: { bar: "bg-brick", label: "No match", tone: "text-brick" },
};

export type GameBoardProps = {
  packSlug: string;
  packName: string;
  noun: string;
  inputPlaceholder: string;
  puzzleNumber: number;
  /** UTC game day, YYYY-MM-DD — the key everything local is stored under. */
  date: string;
  initialState: PublicGameState;
  shareUrl: string;
  /** The signed-in player's own profile, or null when playing anonymously. */
  profileHref: string | null;
};

export function GameBoard({
  packSlug,
  packName,
  noun,
  inputPlaceholder,
  puzzleNumber,
  date,
  initialState,
  shareUrl,
  profileHref,
}: GameBoardProps) {
  const [state, setState] = useState(initialState);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // localStorage is an external store, so read it as one. The server snapshot
  // is 0 — there is no streak to know about until the browser has hydrated.
  const streak = useSyncExternalStore(
    subscribeStreaks,
    () => readStreak(packSlug).currentStreak,
    () => 0,
  );

  // Restore an in-progress day. The stored guesses are replayed through the
  // server action rather than trusted, so a hand-edited localStorage entry
  // gets re-graded rather than believed.
  useEffect(() => {
    const stored = readProgress(packSlug, date);
    if (stored.length === 0) return;

    // Adopt the stored guesses only once the server has graded them, so there
    // is no render where the history is shown against a stale board.
    startTransition(async () => {
      const result = await submitGuesses(packSlug, stored);
      if (result.ok) {
        setGuesses(stored);
        setState(result.state);
      }
    });
  }, [packSlug, date]);

  // Fold a finished puzzle into the local streak — a write to an external
  // system, which is what effects are for. `recordResult` is idempotent per
  // day, so a refresh cannot inflate it, and it notifies the store above.
  useEffect(() => {
    if (state.status === "playing") return;
    recordResult(packSlug, date, state.status === "won");
  }, [state.status, packSlug, date]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const guess = draft.trim();
    setCopied(false);

    if (!guess || pending || state.status !== "playing") return;

    if (guesses.some((g) => normalizeGuess(g, noun) === normalizeGuess(guess, noun))) {
      setNotice("You've already tried that one.");
      return;
    }

    const next = [...guesses, guess];
    setGuesses(next);
    setDraft("");
    setNotice(null);
    writeProgress(packSlug, date, next);

    startTransition(async () => {
      const result = await submitGuesses(packSlug, next);
      if (result.ok) {
        setState(result.state);
      } else {
        // Roll the guess back so a rejected submission doesn't burn a turn.
        setGuesses(guesses);
        writeProgress(packSlug, date, guesses);
        setNotice(result.error);
      }
      inputRef.current?.focus();
    });
  }

  async function onCopy() {
    const text = buildShareText({
      packName,
      puzzleNumber,
      state,
      streak,
      url: shareUrl,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setNotice("Couldn't reach the clipboard — copy the grid above by hand.");
    }
  }

  const over = state.status !== "playing";

  return (
    <div className="space-y-6">
      {/* Field notes — the progressive hint reveal. */}
      <section aria-labelledby="field-notes">
        <h2
          id="field-notes"
          className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
        >
          Field notes
          <span className="ml-2 font-normal normal-case tracking-normal">
            {state.hints.length} of {state.totalHints}
          </span>
        </h2>

        <ol className="mt-3 space-y-2">
          {state.hints.map((hint, i) => (
            <li
              key={hint}
              className="flex gap-3 border-l-2 border-ochre/50 bg-parchment/60 py-2 pl-3 pr-2 text-sm leading-relaxed"
            >
              <span aria-hidden className="font-display text-ochre">
                {i + 1}
              </span>
              <span>{hint}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Guess entry, or the reveal once the day is done. */}
      {!over ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <label htmlFor="guess" className="sr-only">
            Name the {noun}
          </label>
          <div className="flex gap-2">
            <input
              id="guess"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={inputPlaceholder}
              maxLength={MAX_GUESS_LENGTH}
              autoComplete="off"
              disabled={pending}
              className="min-w-0 flex-1 rounded-md border border-ink/25 bg-parchment px-3 py-2 text-base placeholder:text-ink-faint/70 focus-visible:border-ochre focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ochre disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-parchment transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-40"
            >
              {pending ? "…" : "Guess"}
            </button>
          </div>
          <p className="text-xs text-ink-faint">
            {state.guessesRemaining} of {MAX_GUESSES} guesses left
          </p>
        </form>
      ) : (
        <Reveal
          state={state}
          packName={packName}
          puzzleNumber={puzzleNumber}
          streak={streak}
          copied={copied}
          onCopy={onCopy}
          profileHref={profileHref}
        />
      )}

      <p aria-live="polite" className="min-h-[1.25rem] text-sm text-brick">
        {notice}
      </p>

      {/* Ticket-stub guess history (GamePlan.md Section 6). */}
      {state.guesses.length > 0 && (
        <ol className="space-y-1.5" aria-label="Your guesses">
          {state.guesses.map((guess, i) => (
            <li
              key={`${guess.text}-${i}`}
              className="flex items-stretch overflow-hidden rounded-sm border border-ink/10 bg-parchment"
            >
              <span aria-hidden className={`w-1.5 shrink-0 ${STUB[guess.feedback].bar}`} />
              <span className="flex flex-1 items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-sm">{guess.text}</span>
                <span
                  className={`shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.15em] ${STUB[guess.feedback].tone}`}
                >
                  {STUB[guess.feedback].label}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Reveal({
  state,
  packName,
  puzzleNumber,
  streak,
  copied,
  onCopy,
  profileHref,
}: {
  state: PublicGameState;
  packName: string;
  puzzleNumber: number;
  streak: number;
  copied: boolean;
  onCopy: () => void;
  profileHref: string | null;
}) {
  const won = state.status === "won";
  const shareGrid = buildShareText({ packName, puzzleNumber, state, streak });

  return (
    <section
      aria-live="polite"
      className={`rounded-md border-2 bg-parchment p-4 ${won ? "border-moss/60" : "border-brick/50"}`}
    >
      <p
        className={`text-[0.7rem] font-semibold uppercase tracking-[0.22em] ${won ? "text-moss" : "text-brick"}`}
      >
        {won ? `Identified in ${state.guesses.length}` : "Not identified"}
      </p>

      <h2 className="mt-1 font-display text-3xl">{state.reveal?.answer}</h2>

      {state.reveal?.fact && (
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">{state.reveal.fact}</p>
      )}

      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-snug">
        {shareGrid}
      </pre>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md bg-ochre px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {copied ? "Copied" : "Copy result"}
        </button>
        {streak > 0 && (
          <span className="text-sm text-ink-faint">
            <span aria-hidden>🔥</span> {streak} day streak
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Next specimen at midnight UTC.{" "}
        {profileHref ? (
          <Link
            href={profileHref}
            className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          >
            View your profile
          </Link>
        ) : (
          <Link
            href="/sign-up"
            className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          >
            Create an account to keep this streak
          </Link>
        )}
      </p>
    </section>
  );
}

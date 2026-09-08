import { applyResult, EMPTY_STREAK } from "./streak.ts";
import type { LocalStreaks, StreakRecord } from "./streak.ts";

export type { LocalStreaks } from "./streak.ts";

/**
 * Browser-side game state for players without an account
 * (GamePlan.md Section 5.2). Two things live here:
 *
 *   - streaks, per pack plus a combined all-packs streak
 *   - today's guesses, so a refresh does not lose progress
 *
 * **Shape contract for roadmap step 5 (accounts).** `LocalStreaks.packs[slug]`
 * and `LocalStreaks.combined` are each one `streaks` row: `combined` is the
 * row with `pack_id IS NULL`. Migrating an anonymous player into an account
 * means reading `readStreaks()`, resolving each slug to a pack id, and
 * upserting — no reshaping, no recomputation.
 *
 * Guesses are stored in the clear, which is fine: the player typed them, and
 * the answer is not among them unless they already won.
 */
export type LocalProgress = {
  /** UTC game day these guesses belong to. */
  date: string;
  guesses: string[];
};

const STREAKS_KEY = "dailydex.streaks.v1";
const progressKey = (packSlug: string) => `dailydex.progress.${packSlug}.v1`;

const EMPTY_STREAKS: LocalStreaks = { version: 1, packs: {}, combined: EMPTY_STREAK };

/**
 * localStorage throws outright in some privacy modes rather than returning
 * null, so every access is wrapped. A player with storage disabled still gets
 * a working game, just no persistence.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the current session still plays fine.
  }
}

/**
 * Streaks are an external store as far as React is concerned, so components
 * read them through `useSyncExternalStore` rather than mirroring them into
 * component state. `storage` covers other tabs; the local set covers this one,
 * which `storage` does not fire for.
 */
const listeners = new Set<() => void>();

export function subscribeStreaks(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readStreaks(): LocalStreaks {
  const stored = read<LocalStreaks>(STREAKS_KEY, EMPTY_STREAKS);
  // Guard against a hand-edited or half-written blob.
  return {
    version: 1,
    packs: stored.packs && typeof stored.packs === "object" ? stored.packs : {},
    combined: stored.combined ?? EMPTY_STREAK,
  };
}

/**
 * Record a finished puzzle against both the pack streak and the combined one.
 * Idempotent per day via `applyResult`, so calling it again after a refresh
 * changes nothing.
 */
export function recordResult(
  packSlug: string,
  date: string,
  won: boolean,
): LocalStreaks {
  const current = readStreaks();
  const next: LocalStreaks = {
    version: 1,
    packs: {
      ...current.packs,
      [packSlug]: applyResult(current.packs[packSlug] ?? EMPTY_STREAK, date, won),
    },
    // A loss in one pack must not break the combined streak while another
    // pack could still be won today, so only wins are folded in here.
    combined: won ? applyResult(current.combined, date, true) : current.combined,
  };

  write(STREAKS_KEY, next);
  for (const notify of listeners) notify();
  return next;
}

export function readStreak(packSlug: string): StreakRecord {
  return readStreaks().packs[packSlug] ?? EMPTY_STREAK;
}

/** Today's guesses, or an empty list if the stored ones are from another day. */
export function readProgress(packSlug: string, date: string): string[] {
  const stored = read<LocalProgress>(progressKey(packSlug), { date, guesses: [] });
  if (stored.date !== date || !Array.isArray(stored.guesses)) return [];
  return stored.guesses.filter((g): g is string => typeof g === "string");
}

export function writeProgress(packSlug: string, date: string, guesses: string[]): void {
  write(progressKey(packSlug), { date, guesses } satisfies LocalProgress);
}

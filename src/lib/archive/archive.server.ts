import "server-only";

import { isPastGameDay, todayUtc } from "@/lib/engine/date";
import { createPublicClient } from "@/lib/supabase/server";

import { ARCHIVE_PAGE_SIZE } from "./types";
import type { ArchiveEntry, ArchivePage, ArchivePuzzle } from "./types";

/**
 * Archive reads (GamePlan.md Section 5.1).
 *
 * The archive is the one surface that publishes answers, so the "already
 * finished" rule is enforced **twice on purpose**:
 *
 *   1. In SQL, inside `archive_entries` / `archive_entry`, where no caller can
 *      skip it. That is the real control.
 *   2. Here, on everything coming back, via `isPastGameDay`. That is the
 *      backstop — it catches a mistaken migration, a clock skew between the
 *      database and the app, or a future refactor that widens the query.
 *
 * Duplicating a filter is normally a smell. It is warranted here because the
 * failure mode is publishing today's answer to search engines, which cannot be
 * taken back once crawled.
 *
 * Reads use the session-free anon client: the archive is identical for every
 * visitor, so there is nothing to personalise and nothing to leak.
 */

function isEntry(value: unknown): value is ArchiveEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.answer === "string" && typeof row.number === "number";
}

export async function getArchivePage(
  packSlug: string,
  offset = 0,
  limit = ARCHIVE_PAGE_SIZE,
): Promise<ArchivePage> {
  const { data, error } = await createPublicClient().rpc("archive_entries", {
    p_pack: packSlug,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data) return { total: 0, entries: [] };

  const today = todayUtc();
  const raw = (data as ArchivePage).entries ?? [];

  const entries = raw
    .filter((entry) => isEntry(entry) && isPastGameDay(entry.date, today))
    // Rebuild each row rather than passing it through, so a column added to
    // the SQL later cannot ride along into the page.
    .map((entry) => ({ date: entry.date, answer: entry.answer, number: entry.number }));

  // If the backstop dropped anything, the total the database reported was
  // computed under the same broken assumption, so discount it by what was
  // removed. An inflated total would inflate the page count too, and produce
  // empty archive pages for a crawler to find.
  const dropped = raw.length - entries.length;
  const reported = (data as ArchivePage).total ?? entries.length;

  return { total: Math.max(entries.length, reported - dropped), entries };
}

/** Null for a date that has not finished yet, or does not exist. */
export async function getArchivePuzzle(
  packSlug: string,
  date: string,
): Promise<ArchivePuzzle | null> {
  // Refuse before asking. A future date should never reach the database.
  if (!isPastGameDay(date, todayUtc())) return null;

  const { data, error } = await createPublicClient().rpc("archive_entry", {
    p_pack: packSlug,
    p_date: date,
  });

  if (error || !data) return null;

  const row = data as ArchivePuzzle;
  if (!isEntry(row) || !isPastGameDay(row.date, todayUtc())) return null;

  const today = todayUtc();

  return {
    date: row.date,
    answer: row.answer,
    number: row.number,
    fact: typeof row.fact === "string" ? row.fact : null,
    hints: Array.isArray(row.hints) ? row.hints.filter((h) => typeof h === "string") : [],
    // Neighbour links get the same treatment — a "next" pointing at today
    // would hand out a live answer one click away.
    previousDate: isPastGameDay(row.previousDate, today) ? row.previousDate : null,
    nextDate: isPastGameDay(row.nextDate, today) ? row.nextDate : null,
  };
}

/**
 * The game day is UTC, everywhere, for everyone.
 *
 * GamePlan.md Section 5.1 requires an identical puzzle for every visitor on a
 * given day. Using the visitor's local date would break that outright — two
 * people either side of a timezone line would see different puzzles — so the
 * server always resolves "today" in UTC and the client only ever mirrors it
 * for cache keys. Puzzles roll over at 00:00 UTC.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's game day, YYYY-MM-DD in UTC. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDaysUtc(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetweenUtc(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** "8 September 2026" — the catalogue line on the specimen card. */
export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether a game day has finished, and is therefore safe to publish.
 *
 * The archive is the only place an answer is made public, so this is the
 * comparison that keeps today's and every future puzzle out of it. Strictly
 * before: a puzzle is publishable the moment its day ends, never during.
 *
 * Anything that is not a well-formed date is treated as not-past, so a
 * malformed value fails closed rather than slipping through.
 */
export function isPastGameDay(date: unknown, today: string): boolean {
  if (!isIsoDate(date)) return false;
  return date < today;
}

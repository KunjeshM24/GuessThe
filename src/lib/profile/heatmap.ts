import { addDaysUtc, daysBetweenUtc } from "../engine/date.ts";

/**
 * Shapes a sparse list of active days into the 53x7 grid the heatmap renders
 * (GamePlan.md Section 5.3).
 *
 * The database returns one row per *active* day only — a few hundred at most.
 * This fills in the empty days and buckets the shading, so there is no
 * per-day query and nothing proportional to the user's history.
 */

/** 0 = no activity, 3 = played every live pack that day (Section 6). */
export type HeatLevel = 0 | 1 | 2 | 3;

export type HeatmapCell = {
  /** YYYY-MM-DD, UTC. */
  date: string;
  packs: number;
  level: HeatLevel;
};

export type Heatmap = {
  /** Columns, oldest first. Each holds 7 cells, Monday through Sunday. */
  weeks: HeatmapCell[][];
  /** `{ column, label }` for each week that opens a new month. */
  monthLabels: { column: number; label: string }[];
  activeDays: number;
};

const WEEKS = 53;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Four shades from "no activity" up to "played every live pack".
 *
 * With two live packs only levels 0, 2 and 3 can occur — that is correct
 * rather than a bug: full moss is reserved for a complete day, and a complete
 * day is both packs. The fourth shade starts appearing at three live packs.
 */
export function levelFor(packs: number, livePackCount: number): HeatLevel {
  if (packs <= 0) return 0;
  const denominator = Math.max(livePackCount, 1);
  const scaled = Math.ceil((packs / denominator) * 3);
  return Math.min(3, Math.max(1, scaled)) as HeatLevel;
}

/** The Monday on or before `date`. */
function weekStart(date: string): string {
  // 1970-01-01 was a Thursday, so shift by 3 to make Monday the zero point.
  const dayIndex = (daysBetweenUtc("1970-01-01", date) + 3) % 7;
  return addDaysUtc(date, -dayIndex);
}

export function buildHeatmap(
  days: readonly { day: string; packs: number }[],
  today: string,
  livePackCount: number,
): Heatmap {
  const byDay = new Map(days.map((d) => [d.day, d.packs]));

  // 53 columns ending in the week containing today, so the grid always has the
  // same shape and today sits in the last column.
  const start = addDaysUtc(weekStart(today), -(WEEKS - 1) * 7);

  const weeks: HeatmapCell[][] = [];
  const monthLabels: { column: number; label: string }[] = [];
  let activeDays = 0;
  let lastMonth = "";

  for (let column = 0; column < WEEKS; column += 1) {
    const cells: HeatmapCell[] = [];

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDaysUtc(start, column * 7 + weekday);
      const packs = byDay.get(date) ?? 0;
      if (packs > 0) activeDays += 1;

      cells.push({ date, packs, level: levelFor(packs, livePackCount) });
    }

    // Label a column when its Monday opens a month the previous one did not.
    const month = cells[0].date.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      monthLabels.push({
        column,
        label: MONTHS[Number(cells[0].date.slice(5, 7)) - 1],
      });
    }

    weeks.push(cells);
  }

  return { weeks, monthLabels, activeDays };
}

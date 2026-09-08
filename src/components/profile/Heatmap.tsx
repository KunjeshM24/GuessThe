import { formatLongDate } from "@/lib/engine/date";
import { buildHeatmap } from "@/lib/profile/heatmap";
import type { HeatLevel } from "@/lib/profile/heatmap";

/** Four shades, parchment-dark up to full moss (GamePlan.md Section 6). */
const SHADE: Record<HeatLevel, string> = {
  0: "bg-parchment-dark",
  1: "bg-moss/30",
  2: "bg-moss/60",
  3: "bg-moss",
};

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function Heatmap({
  days,
  today,
  livePackCount,
}: {
  days: readonly { day: string; packs: number }[];
  today: string;
  livePackCount: number;
}) {
  const { weeks, monthLabels, activeDays } = buildHeatmap(days, today, livePackCount);

  return (
    <section aria-labelledby="activity-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="activity-heading"
          className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
        >
          Activity
        </h2>
        <p className="text-xs text-ink-faint">
          {activeDays} active {activeDays === 1 ? "day" : "days"} in the past year
        </p>
      </div>

      {/* Wide on every screen, so it scrolls inside itself rather than
          stretching the page. */}
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="flex gap-[3px] pl-8 text-[0.6rem] text-ink-faint">
            {weeks.map((_, column) => {
              const label = monthLabels.find((m) => m.column === column);
              return (
                <span key={column} className="w-[10px] shrink-0">
                  {label?.label ?? ""}
                </span>
              );
            })}
          </div>

          <div className="mt-1 flex gap-[3px]">
            <div className="flex w-7 shrink-0 flex-col gap-[3px] text-[0.6rem] leading-[10px] text-ink-faint">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i} className="h-[10px]">
                  {label}
                </span>
              ))}
            </div>

            <div
              role="img"
              aria-label={`Activity heatmap: ${activeDays} active days in the past year.`}
              className="flex gap-[3px]"
            >
              {weeks.map((week, column) => (
                <div key={column} className="flex flex-col gap-[3px]">
                  {week.map((cell) => (
                    <span
                      key={cell.date}
                      className={`size-[10px] rounded-[2px] ${SHADE[cell.level]}`}
                      // Native tooltip: no JS, works on keyboard focus of the
                      // scroll container, and degrades to nothing gracefully.
                      title={
                        cell.packs === 0
                          ? `No packs played on ${formatLongDate(cell.date)}`
                          : `${cell.packs} ${cell.packs === 1 ? "pack" : "packs"} on ${formatLongDate(cell.date)}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[0.6rem] text-ink-faint">
        <span>Less</span>
        {([0, 1, 2, 3] as HeatLevel[]).map((level) => (
          <span key={level} className={`size-[10px] rounded-[2px] ${SHADE[level]}`} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

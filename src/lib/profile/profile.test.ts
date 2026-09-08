import assert from "node:assert/strict";
import test from "node:test";

import { generatedAvatar } from "./avatar.ts";
import { buildHeatmap, levelFor } from "./heatmap.ts";
import { summariseRank } from "./rank.ts";

const TODAY = "2026-09-11"; // a Friday

test("heatmap is always a full 53-week grid of whole weeks", () => {
  const { weeks } = buildHeatmap([], TODAY, 2);
  assert.equal(weeks.length, 53);
  assert.ok(weeks.every((week) => week.length === 7));
});

test("heatmap columns start on Monday and end in the week containing today", () => {
  const { weeks } = buildHeatmap([], TODAY, 2);

  // 1970-01-05 was a Monday; every column head must be the same weekday.
  const dayOfWeek = (date: string) =>
    new Date(`${date}T00:00:00Z`).getUTCDay();

  assert.ok(weeks.every((week) => dayOfWeek(week[0].date) === 1), "column head is not a Monday");

  const lastWeek = weeks.at(-1)!;
  assert.ok(
    lastWeek.some((cell) => cell.date === TODAY),
    "today is not in the final column",
  );
});

test("heatmap dates are contiguous with no gaps or repeats", () => {
  const dates = buildHeatmap([], TODAY, 2).weeks.flat().map((c) => c.date);
  assert.equal(new Set(dates).size, dates.length, "duplicate day in the grid");

  for (let i = 1; i < dates.length; i += 1) {
    const gap =
      (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) /
      86_400_000;
    assert.equal(gap, 1, `gap between ${dates[i - 1]} and ${dates[i]}`);
  }
});

test("active days are placed on their own dates and counted once", () => {
  const { weeks, activeDays } = buildHeatmap(
    [
      { day: "2026-09-11", packs: 2 },
      { day: "2026-09-10", packs: 1 },
      { day: "2026-01-02", packs: 1 },
    ],
    TODAY,
    2,
  );

  const cells = new Map(weeks.flat().map((c) => [c.date, c]));
  assert.equal(cells.get("2026-09-11")?.packs, 2);
  assert.equal(cells.get("2026-09-10")?.packs, 1);
  assert.equal(cells.get("2026-09-09")?.packs, 0);
  assert.equal(activeDays, 3);
});

test("days outside the window are ignored rather than crashing", () => {
  const { activeDays } = buildHeatmap(
    [
      { day: "2019-01-01", packs: 2 },
      { day: "2026-09-11", packs: 1 },
    ],
    TODAY,
    2,
  );
  assert.equal(activeDays, 1);
});

test("shading runs from no activity up to every live pack", () => {
  assert.equal(levelFor(0, 2), 0);
  // Two live packs: one pack is partial, both is a full day.
  assert.equal(levelFor(1, 2), 2);
  assert.equal(levelFor(2, 2), 3);
  // Three live packs use all four shades.
  assert.equal(levelFor(1, 3), 1);
  assert.equal(levelFor(2, 3), 2);
  assert.equal(levelFor(3, 3), 3);
  // Never exceeds the top shade, and never divides by zero.
  assert.equal(levelFor(5, 2), 3);
  assert.equal(levelFor(1, 0), 3);
});

test("every month in the window gets exactly one label", () => {
  const { monthLabels } = buildHeatmap([], TODAY, 2);
  const columns = monthLabels.map((m) => m.column);
  assert.equal(new Set(columns).size, columns.length, "two labels on one column");
  // 53 weeks spans 12 or 13 month boundaries.
  assert.ok(monthLabels.length >= 12 && monthLabels.length <= 14, `${monthLabels.length} labels`);
});

test("rank reads sensibly at the edges", () => {
  // Nobody is ranked before they have solved anything.
  assert.deepEqual(summariseRank(null, 0, 0), { kind: "unranked" });
  assert.deepEqual(summariseRank(1, 1, 0), { kind: "unranked" });
  // The only player is not "top 100%".
  assert.deepEqual(summariseRank(1, 1, 5), { kind: "only-player", rank: 1 });
});

test("percentile is 1-100 and best rank is top 1%", () => {
  assert.deepEqual(summariseRank(1, 100, 40), {
    kind: "ranked",
    rank: 1,
    players: 100,
    topPercent: 1,
  });
  const topPercent = (rank: number, players: number, solved: number) => {
    const summary = summariseRank(rank, players, solved);
    assert.equal(summary.kind, "ranked");
    return summary.kind === "ranked" ? summary.topPercent : -1;
  };

  assert.equal(topPercent(100, 100, 1), 100);
  assert.equal(topPercent(50, 100, 20), 50);
  // Rounds up, never to zero.
  assert.equal(topPercent(1, 5000, 90), 1);
});

test("generated avatars are deterministic and legible", () => {
  const a = generatedAvatar("ada");
  assert.deepEqual(a, generatedAvatar("ada"));
  assert.equal(a.initials, "AD");
  // Case does not change the colour, so a rename in case keeps the identity.
  assert.equal(generatedAvatar("ADA").background, a.background);

  // Ochre is the one background light enough to need dark text.
  for (const name of ["a", "bb", "ccc", "player1", "zz_top", "x9"]) {
    const avatar = generatedAvatar(name);
    assert.equal(
      avatar.foreground,
      avatar.background === "var(--color-ochre)"
        ? "var(--color-ink)"
        : "var(--color-parchment)",
    );
  }
});

test("avatar initials survive awkward usernames", () => {
  assert.equal(generatedAvatar("a").initials, "A");
  assert.equal(generatedAvatar("___").initials, "??");
  assert.equal(generatedAvatar("9lives").initials, "9L");
});

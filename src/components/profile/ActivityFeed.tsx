"use client";

import { useState, useTransition } from "react";

import { loadMoreActivityAction } from "@/app/u/[username]/actions";
import { formatLongDate } from "@/lib/engine/date";
import { ACTIVITY_PAGE_SIZE } from "@/lib/profile/types";
import type { ActivityEntry } from "@/lib/profile/types";

/**
 * Recent solves, newest first, with an explicit "load more" rather than an
 * unbounded list (GamePlan.md Section 5.3). Never shows the answer — only
 * which pack, which day, and how it went.
 */
export function ActivityFeed({
  username,
  initial,
}: {
  username: string;
  initial: ActivityEntry[];
}) {
  const [entries, setEntries] = useState(initial);
  // The first page arriving full is the only hint there may be more.
  const [exhausted, setExhausted] = useState(initial.length < ACTIVITY_PAGE_SIZE);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      const next = await loadMoreActivityAction(username, entries.length);
      if (next.length < ACTIVITY_PAGE_SIZE) setExhausted(true);
      if (next.length > 0) setEntries((current) => [...current, ...next]);
    });
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-ink/20 p-4 text-sm text-ink-faint">
        No puzzles played yet.
      </p>
    );
  }

  return (
    <div>
      <ol className="space-y-1.5">
        {entries.map((entry) => (
          <li
            key={`${entry.packSlug}-${entry.day}`}
            className="flex items-stretch overflow-hidden rounded-sm border border-ink/10 bg-parchment"
          >
            <span
              aria-hidden
              className={`w-1.5 shrink-0 ${entry.won ? "bg-moss" : "bg-brick"}`}
            />
            <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="text-sm font-medium">{entry.packName}</span>
              <span className="text-xs text-ink-faint">
                {formatLongDate(entry.day)}
                {" · "}
                {entry.won ? `solved in ${entry.guessesUsed}` : "not solved"}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {!exhausted && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mt-3 w-full rounded-md border border-ink/25 px-4 py-2 text-sm font-medium text-ink-faint transition-colors hover:border-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-50"
        >
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

import Link from "next/link";

import { Avatar } from "@/components/profile/Avatar";
import { getLeaderboard } from "@/lib/leaderboard/leaderboard.server";
import { isLeaderboardScope } from "@/lib/leaderboard/types";
import type { LeaderboardScope } from "@/lib/leaderboard/types";
import { isPackSlug, PACKS } from "@/packs/registry";

export const metadata = {
  title: "Leaderboard",
  description: "Daily and all-time rankings across every Daily Dex pack.",
};

/**
 * Filters live in the URL rather than in client state, so every view is
 * linkable, server-rendered and indexable — and there is no extra endpoint
 * for a client to hammer. The expensive part is the ranking query, and that
 * is cached for a minute in `leaderboard.server.ts`.
 */
export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const params = await searchParams;

  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const packParam = Array.isArray(params.pack) ? params.pack[0] : params.pack;

  const scope: LeaderboardScope = isLeaderboardScope(scopeParam) ? scopeParam : "daily";
  const pack = typeof packParam === "string" && isPackSlug(packParam) ? packParam : null;

  const rows = await getLeaderboard(scope, pack);
  const isDaily = scope === "daily";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl sm:text-4xl">Leaderboard</h1>
      <p className="mt-1 text-sm text-ink-faint">
        {isDaily
          ? "Today's board, by fewest guesses. Resets at midnight UTC."
          : "All time, by puzzles solved."}
      </p>

      <div className="mt-6 space-y-2">
        <Filters label="When" current={scope} pack={pack} />
        <Filters label="Pack" current={scope} pack={pack} packRow />
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-ink/20 p-6 text-sm text-ink-faint">
          {isDaily
            ? "Nobody has solved today's puzzle yet. Be the first."
            : "No solves recorded yet."}
        </p>
      ) : (
        <ol className="mt-6 space-y-1.5">
          {rows.map((row) => (
            <li
              key={`${row.rank}-${row.username}`}
              className="flex items-center gap-3 rounded-md border border-ink/10 bg-parchment-dark px-3 py-2"
            >
              <span
                className={`w-7 shrink-0 text-right font-display text-lg ${
                  row.rank <= 3 ? "text-ochre" : "text-ink-faint"
                }`}
              >
                {row.rank}
              </span>

              <Avatar username={row.username} avatarUrl={row.avatarUrl} size={32} />

              <Link
                href={`/u/${row.username}`}
                className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
              >
                {row.username}
              </Link>

              <span className="shrink-0 text-xs text-ink-faint">
                {isDaily
                  ? `${row.guesses} ${row.guesses === 1 ? "guess" : "guesses"}${
                      pack === null ? ` · ${row.solved} packs` : ""
                    }`
                  : `${row.solved} solved`}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        Showing the top {rows.length || 0}. Rankings update within a minute of a solve.
      </p>
    </main>
  );
}

/** Tab rows that only ever change one search param at a time. */
function Filters({
  label,
  current,
  pack,
  packRow = false,
}: {
  label: string;
  current: LeaderboardScope;
  pack: string | null;
  packRow?: boolean;
}) {
  const options = packRow
    ? [
        { key: null as string | null, text: "Combined" },
        ...PACKS.map((p) => ({ key: p.slug as string | null, text: p.name })),
      ]
    : [
        { key: "daily" as string | null, text: "Today" },
        { key: "all-time" as string | null, text: "All time" },
      ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-[0.65rem] uppercase tracking-[0.15em] text-ink-faint">
        {label}
      </span>
      {options.map((option) => {
        const active = packRow ? pack === option.key : current === option.key;
        const query = new URLSearchParams();
        query.set("scope", packRow ? current : (option.key as string));
        const nextPack = packRow ? option.key : pack;
        if (nextPack) query.set("pack", nextPack);

        return (
          <Link
            key={option.text}
            href={`/leaderboard?${query.toString()}`}
            aria-current={active ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre ${
              active
                ? "border-ink bg-ink text-parchment"
                : "border-ink/25 text-ink-faint hover:border-ink/50 hover:text-ink"
            }`}
          >
            {option.text}
          </Link>
        );
      })}
    </div>
  );
}

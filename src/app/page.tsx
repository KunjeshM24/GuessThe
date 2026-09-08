import Link from "next/link";

import { getViewer } from "@/lib/auth";
import { PREVIEW_UNLISTED_PACKS } from "@/lib/env.server";
import { getViewerSummary } from "@/lib/hub.server";
import { getVisiblePacks } from "@/lib/packs.server";
import type { VisiblePack } from "@/lib/packs.server";

export const dynamic = "force-dynamic";

// Title and description come from the root layout, which is the one place
// the site's own name is written.
export const metadata = { alternates: { canonical: "/" } };

/**
 * The hub (GamePlan.md Section 4): the bare domain, linking to every live
 * pack. Each pack also answers on its own subdomain — see `src/proxy.ts`.
 */
export default async function Home() {
  const viewer = await getViewer();
  const [packs, summary] = await Promise.all([
    getVisiblePacks(),
    viewer ? getViewerSummary(viewer.id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <header className="max-w-prose">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Daily Dex</h1>
        <p className="mt-3 text-ink-faint">
          One puzzle a day, per obsession. Six guesses, a clue after every miss, and a
          streak worth protecting. Everything is playable without an account.
        </p>
      </header>

      {viewer && summary && (
        <section
          aria-labelledby="your-progress"
          className="mt-8 rounded-lg border border-ink/10 bg-parchment-dark p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="your-progress"
              className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
            >
              Your progress
            </h2>
            <Link
              href={`/u/${viewer.username}`}
              className="text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
            >
              Full profile
            </Link>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Current streak" value={summary.currentStreak} />
            <Stat label="Longest streak" value={summary.longestStreak} />
            <Stat label="Puzzles solved" value={summary.totalSolved} />
          </dl>
        </section>
      )}

      <section aria-labelledby="packs-heading" className="mt-10">
        <h2
          id="packs-heading"
          className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
        >
          {packs.length === 1 ? "Today's pack" : "Today's packs"}
        </h2>

        {packs.length === 0 ? (
          <NoPacksYet />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {packs.map((pack) => (
              <PackCard key={pack.slug} pack={pack} />
            ))}
          </ul>
        )}
      </section>

      {PREVIEW_UNLISTED_PACKS && (
        <p className="mt-8 rounded-sm border border-ochre/40 bg-ochre/10 px-3 py-2 text-xs">
          <strong className="font-semibold">Preview mode.</strong> Packs that are not yet
          live are listed because <code>PREVIEW_UNLISTED_PACKS</code> is set. Unset it to
          see what the public sees.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="font-display text-2xl leading-none">{value}</dd>
      <dt className="mt-1.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </dt>
    </div>
  );
}

function PackCard({ pack }: { pack: VisiblePack }) {
  return (
    <li>
      <Link
        href={`/play/${pack.slug}`}
        className="group flex h-full flex-col rounded-lg border border-ink/10 bg-parchment-dark p-5 transition-colors hover:border-ochre focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-xl">{pack.name}</span>
          {!pack.isLive && (
            <span className="shrink-0 rounded-full border border-ochre/50 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-ochre">
              Not live
            </span>
          )}
        </span>
        <span className="mt-1 text-sm text-ink-faint">{pack.description}</span>
        <span className="mt-4 text-xs font-medium text-ink-faint group-hover:text-ink">
          Play today&apos;s {pack.noun} &rarr;
        </span>
      </Link>
    </li>
  );
}

/**
 * Both packs ship unlaunched, so this is the state the site is actually in
 * until the flags are flipped. It has to read like a plan, not a bug.
 */
function NoPacksYet() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-ink/25 p-6">
      <p className="font-display text-lg">Nothing live just yet</p>
      <p className="mt-1 max-w-prose text-sm text-ink-faint">
        The first packs are being checked over before they open. Nothing to play here
        today — but the archive and the leaderboard are already running.
      </p>
      <Link
        href="/leaderboard"
        className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-parchment transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        See the leaderboard
      </Link>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { getArchivePuzzle } from "@/lib/archive/archive.server";
import { formatLongDate, isIsoDate } from "@/lib/engine/date";
import { isPackVisible } from "@/lib/packs.server";
import { getPack, isPackSlug } from "@/packs/registry";

export const dynamic = "force-dynamic";

/**
 * One finished puzzle, its own indexable page (GamePlan.md Section 5.1).
 *
 * `getArchivePuzzle` returns null for anything that is not strictly in the
 * past, so a URL naming today or a future date 404s here — the same as a date
 * that never existed. That is deliberate: a 404 tells a crawler nothing about
 * whether a puzzle is scheduled.
 */
export async function generateMetadata({ params }: PageProps<"/archive/[pack]/[date]">) {
  const { pack, date } = await params;
  if (!isPackSlug(pack) || !isIsoDate(date)) return {};

  const puzzle = await getArchivePuzzle(pack, date);
  if (!puzzle) return { title: "Not found" };

  const { name } = getPack(pack);
  const readable = formatLongDate(puzzle.date);

  return {
    title: `${name} answer — ${readable}`,
    description: `The ${name} puzzle for ${readable} was ${puzzle.answer}.${
      puzzle.fact ? ` ${puzzle.fact}` : ""
    }`,
    alternates: { canonical: `/archive/${pack}/${puzzle.date}` },
    openGraph: {
      title: `${name} answer — ${readable}`,
      description: `Puzzle No. ${puzzle.number}: ${puzzle.answer}.`,
      type: "article",
    },
  };
}

export default async function ArchiveEntryPage({
  params,
}: PageProps<"/archive/[pack]/[date]">) {
  const { pack: slug, date } = await params;
  if (!isPackSlug(slug) || !isIsoDate(date)) notFound();
  if (!(await isPackVisible(slug))) notFound();

  const puzzle = await getArchivePuzzle(slug, date);
  if (!puzzle) notFound();

  const packCopy = getPack(slug);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
        <Link
          href={`/archive/${slug}`}
          className="underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          &larr; {packCopy.name} archive
        </Link>
        <Link
          href={`/play/${slug}`}
          className="underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          Play today&apos;s {packCopy.noun}
        </Link>
      </nav>

      <article className="rounded-lg border-2 border-ink/15 bg-parchment-dark p-5 sm:p-7">
        <header className="border-b border-ink/15 pb-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">
            {packCopy.name} · No. {puzzle.number} · {formatLongDate(puzzle.date)}
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight sm:text-4xl">
            {puzzle.answer}
          </h1>
        </header>

        {puzzle.fact && (
          <p className="mt-4 max-w-prose text-sm leading-relaxed">{puzzle.fact}</p>
        )}

        {puzzle.hints.length > 0 && (
          <section className="mt-6" aria-labelledby="clues">
            <h2
              id="clues"
              className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
            >
              The clues
            </h2>
            <ol className="mt-3 space-y-2">
              {puzzle.hints.map((hint, i) => (
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
        )}
      </article>

      <nav
        aria-label="Nearby puzzles"
        className="mt-5 flex items-center justify-between gap-3 text-sm"
      >
        {puzzle.previousDate ? (
          <Link
            href={`/archive/${slug}/${puzzle.previousDate}`}
            className="rounded-md border border-ink/25 px-3 py-1.5 text-xs hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          >
            &larr; {formatLongDate(puzzle.previousDate)}
          </Link>
        ) : (
          <span />
        )}
        {puzzle.nextDate ? (
          <Link
            href={`/archive/${slug}/${puzzle.nextDate}`}
            className="rounded-md border border-ink/25 px-3 py-1.5 text-xs hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          >
            {formatLongDate(puzzle.nextDate)} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}

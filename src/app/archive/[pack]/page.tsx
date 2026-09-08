import Link from "next/link";
import { notFound } from "next/navigation";

import { getArchivePage } from "@/lib/archive/archive.server";
import { ARCHIVE_PAGE_SIZE } from "@/lib/archive/types";
import { formatLongDate } from "@/lib/engine/date";
import { isPackVisible } from "@/lib/packs.server";
import { getPack, isPackSlug } from "@/packs/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/archive/[pack]">) {
  const { pack } = await params;
  if (!isPackSlug(pack)) return {};

  const { name, noun } = getPack(pack);
  return {
    title: `${name} archive — every past answer`,
    description: `Every past ${name} puzzle with its answer and the clues that led to it. One ${noun} a day, going back to the start.`,
    alternates: { canonical: `/archive/${pack}` },
  };
}

export default async function ArchiveIndexPage({
  params,
  searchParams,
}: PageProps<"/archive/[pack]">) {
  const { pack: slug } = await params;
  if (!isPackSlug(slug)) notFound();
  if (!(await isPackVisible(slug))) notFound();

  const query = await searchParams;
  const pageParam = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Math.max(1, Number.parseInt(String(pageParam ?? "1"), 10) || 1);

  const packCopy = getPack(slug);
  const { total, entries } = await getArchivePage(
    slug,
    (page - 1) * ARCHIVE_PAGE_SIZE,
    ARCHIVE_PAGE_SIZE,
  );

  const lastPage = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  if (page > lastPage && total > 0) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <nav className="mb-6 text-xs text-ink-faint">
        <Link
          href={`/play/${slug}`}
          className="underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          &larr; Play today&apos;s {packCopy.noun}
        </Link>
      </nav>

      <h1 className="font-display text-3xl sm:text-4xl">{packCopy.name} archive</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-faint">
        Every {packCopy.noun} that has already had its day, with the answer. Today&apos;s
        puzzle is not here — it joins the archive once the day is over.
      </p>

      {entries.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-ink/20 p-6 text-sm text-ink-faint">
          Nothing archived yet. The first entry appears the day after the first puzzle.
        </p>
      ) : (
        <>
          <p className="mt-6 text-xs uppercase tracking-[0.15em] text-ink-faint">
            {total} {total === 1 ? "puzzle" : "puzzles"}
          </p>

          <ol className="mt-3 space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.date}>
                <Link
                  href={`/archive/${slug}/${entry.date}`}
                  className="flex items-baseline justify-between gap-3 rounded-md border border-ink/10 bg-parchment-dark px-3 py-2.5 transition-colors hover:border-ochre focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
                >
                  <span className="min-w-0">
                    <span className="font-display text-lg">{entry.answer}</span>
                    <span className="ms-2 text-xs text-ink-faint">No. {entry.number}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatLongDate(entry.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          {lastPage > 1 && (
            <nav
              aria-label="Archive pages"
              className="mt-6 flex items-center justify-between gap-3 text-sm"
            >
              {page > 1 ? (
                <Link
                  href={`/archive/${slug}?page=${page - 1}`}
                  className="rounded-md border border-ink/25 px-3 py-1.5 text-xs hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
                >
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-ink-faint">
                Page {page} of {lastPage}
              </span>
              {page < lastPage ? (
                <Link
                  href={`/archive/${slug}?page=${page + 1}`}
                  className="rounded-md border border-ink/25 px-3 py-1.5 text-xs hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
                >
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}

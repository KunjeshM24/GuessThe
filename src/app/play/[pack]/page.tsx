import Link from "next/link";
import { notFound } from "next/navigation";

import { GameBoard } from "@/components/game/GameBoard";
import { HowToPlay } from "@/components/game/HowToPlay";
import { getViewer } from "@/lib/auth";
import { formatLongDate, todayUtc } from "@/lib/engine/date";
import { evaluate } from "@/lib/engine/guess";
import { getDailyPuzzle } from "@/lib/engine/puzzle";
import { SITE_URL } from "@/lib/env";
import { getVisiblePacks, isPackVisible } from "@/lib/packs.server";
import type { VisiblePack } from "@/lib/packs.server";
import { getPack, isPackSlug } from "@/packs/registry";
import type { PackSlug } from "@/packs/registry";

/**
 * Always rendered fresh: the puzzle changes at midnight UTC, and the page
 * must never be served from a cache built on a previous game day.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/play/[pack]">) {
  const { pack } = await params;
  if (!isPackSlug(pack)) return {};
  const { name, description } = getPack(pack);
  return {
    title: `${name} — ${formatLongDate(todayUtc())}`,
    description,
  };
}

export default async function PlayPage({ params }: PageProps<"/play/[pack]">) {
  const { pack: slug } = await params;
  if (!isPackSlug(slug)) notFound();

  // An unlaunched pack is a 404 for the public, exactly as if its subdomain
  // did not exist yet. PREVIEW_UNLISTED_PACKS opens it locally for review.
  if (!(await isPackVisible(slug))) notFound();

  const packCopy = getPack(slug);
  const [resolved, viewer, visiblePacks] = await Promise.all([
    getDailyPuzzle(slug),
    getViewer(),
    getVisiblePacks(),
  ]);
  const puzzle = resolved?.puzzle ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <CatalogTabs active={slug} packs={visiblePacks} />

      <article className="rounded-lg border-2 border-ink/15 bg-parchment-dark p-5 shadow-[0_1px_0_rgba(35,59,55,0.08)] sm:p-7">
        <header className="flex items-start justify-between gap-4 border-b border-ink/15 pb-4">
          <div>
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">
              {packCopy.name}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-faint">
              {puzzle ? `No. ${puzzle.number} · ` : ""}
              {formatLongDate(todayUtc())}
            </p>
          </div>
          <HowToPlay packName={packCopy.name} steps={packCopy.howToPlay} />
        </header>

        {resolved && !resolved.pack.isLive && (
          <p className="mt-4 rounded-sm border border-ochre/40 bg-ochre/10 px-3 py-2 text-xs text-ink">
            <strong className="font-semibold">Preview.</strong> This pack is not live
            yet — flip <code>is_live</code> on the <code>packs</code> row to publish it.
          </p>
        )}

        <div className="mt-5">
          {!resolved ? (
            <SetupNotice
              title="Pack not found in the database"
              body="Apply the migrations and seed the pack, then reload. See the README."
            />
          ) : !puzzle ? (
            <SetupNotice
              title="No puzzle set for today"
              body={`Nothing is scheduled for ${formatLongDate(todayUtc())}. Run the seed script to fill the calendar.`}
            />
          ) : (
            <>
              <SpecimenPlate
                heroImageUrl={puzzle.heroImageUrl}
                number={puzzle.number}
                noun={packCopy.noun}
              />
              {/* Only the public state crosses to the client — never `puzzle`. */}
              <div className="mt-5">
                <GameBoard
                  packSlug={slug}
                  packName={packCopy.name}
                  noun={packCopy.noun}
                  inputPlaceholder={packCopy.inputPlaceholder}
                  puzzleNumber={puzzle.number}
                  date={puzzle.date}
                  initialState={evaluate(puzzle, [])}
                  shareUrl={`${SITE_URL}/play/${slug}`}
                  profileHref={viewer ? `/u/${viewer.username}` : null}
                />
              </div>
            </>
          )}
        </div>
      </article>

      <nav className="mt-4 text-xs text-ink-faint">
        <Link
          href={`/archive/${slug}`}
          className="underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          Past {packCopy.noun}s and their answers &rarr;
        </Link>
      </nav>
    </main>
  );
}

/** Catalog-tab pack picker (GamePlan.md Section 6), live packs only. */
function CatalogTabs({ active, packs }: { active: PackSlug; packs: VisiblePack[] }) {
  return (
    <nav aria-label="Packs" className="mb-[-2px] flex gap-1">
      {packs.map((pack) => {
        const isActive = pack.slug === active;
        return (
          <Link
            key={pack.slug}
            href={`/play/${pack.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-t-md border-2 border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre ${
              isActive
                ? "border-ink/15 bg-parchment-dark text-ink"
                : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {pack.noun}s
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Hero image slot. No plates are shipped with the seed content yet — hotlinking
 * someone else's photography would be a licensing problem — so an unmounted
 * slot is drawn instead. Fill `puzzles.hero_image_url` to replace it.
 */
function SpecimenPlate({
  heroImageUrl,
  number,
  noun,
}: {
  heroImageUrl: string | null;
  number: number;
  noun: string;
}) {
  if (heroImageUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- hosts are unknown until content is loaded; revisit with next/image once an image CDN is chosen. */
      <img
        src={heroImageUrl}
        alt={`Today's ${noun}, shown without its name`}
        className="aspect-[3/2] w-full rounded-sm border border-ink/20 object-cover"
      />
    );
  }

  return (
    <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-ink/25 bg-parchment/50 text-ink-faint">
      <svg viewBox="0 0 48 48" aria-hidden className="size-10 opacity-40" fill="none">
        <path
          d="M24 42V20M24 20c0-7 5-13 12-14 1 8-4 14-12 14Zm0 4c0-6-4-11-10-12-1 7 3 12 10 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-[0.65rem] uppercase tracking-[0.2em]">Plate no. {number}</p>
      <p className="text-xs">Specimen photograph not yet mounted</p>
    </div>
  );
}

function SetupNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sm border border-brick/40 bg-brick/5 p-4">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-ink-faint">{body}</p>
    </div>
  );
}

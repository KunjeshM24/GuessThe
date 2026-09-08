import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/profile/ActivityFeed";
import { Avatar } from "@/components/profile/Avatar";
import { Heatmap } from "@/components/profile/Heatmap";
import { getViewer } from "@/lib/auth";
import { formatLongDate, todayUtc } from "@/lib/engine/date";
import {
  combinedStreak,
  getProfileActivity,
  getProfileSummary,
} from "@/lib/profile/profile.server";
import { toPublicActivity } from "@/lib/profile/types";
import type { EarnedBadge, ProfileSummary } from "@/lib/profile/types";
import { summariseRank } from "@/lib/profile/rank";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const summary = await getProfileSummary(username);
  if (!summary) return { title: "Player not found" };

  const { profile, totalSolved } = summary;
  return {
    title: profile.username,
    description: `${profile.username} has solved ${totalSolved} daily puzzles on Daily Dex.`,
  };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;

  // One round trip for the header, stats, streaks, heatmap and badges; a
  // second for the first page of activity. Both are public reads.
  const [summary, activity, viewer] = await Promise.all([
    getProfileSummary(username),
    getProfileActivity(username),
    getViewer(),
  ]);

  if (!summary) notFound();

  const { profile } = summary;
  const isOwnProfile = viewer?.username.toLowerCase() === profile.username.toLowerCase();
  const combined = combinedStreak(summary.streaks);
  const rank = summariseRank(summary.rank, summary.rankedPlayers, summary.totalSolved);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      {/* Header band. The serif is reserved for the page title (Section 6). */}
      <header className="flex flex-wrap items-start gap-5 border-b border-ink/15 pb-6">
        <Avatar username={profile.username} avatarUrl={profile.avatarUrl} />

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">
            {profile.username}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-faint">
            Joined {formatLongDate(profile.joinedAt.slice(0, 10))}
          </p>

          {profile.bio ? (
            <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed">
              {profile.bio}
            </p>
          ) : (
            isOwnProfile && (
              <p className="mt-3 text-sm text-ink-faint">
                No bio yet.{" "}
                <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
                  Add one
                </Link>
                .
              </p>
            )
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <RankBadge rank={rank} />
          {isOwnProfile && (
            <Link
              href="/settings"
              className="rounded-full border border-ink/25 px-3 py-1 text-xs font-medium text-ink-faint transition-colors hover:border-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
            >
              Edit profile
            </Link>
          )}
        </div>
      </header>

      {/* Two columns on desktop, stacked on mobile (Section 6). `min-w-0` on
          both: without it the heatmap's intrinsic width overrides the fr
          track and squeezes the right column to nothing. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-8">
          <StreakStats summary={summary} combined={combined} />
          <PackBreakdown summary={summary} />
          <Heatmap
            days={summary.heatmap}
            today={todayUtc()}
            livePackCount={summary.livePackCount}
          />
        </div>

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="badges-heading">
            <h2
              id="badges-heading"
              className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
            >
              Badges
            </h2>
            <BadgeGrid badges={summary.badges} />
          </section>

          <section aria-labelledby="recent-heading">
            <h2
              id="recent-heading"
              className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
            >
              Recent activity
            </h2>
            <ActivityFeed
              username={profile.username}
              initial={activity.map(toPublicActivity)}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function RankBadge({ rank }: { rank: ReturnType<typeof summariseRank> }) {
  if (rank.kind === "unranked") {
    return <span className="text-xs text-ink-faint">Unranked</span>;
  }

  if (rank.kind === "only-player") {
    return (
      <span className="rounded-full bg-ochre px-3 py-1 text-xs font-semibold text-ink">
        First player
      </span>
    );
  }

  return (
    <div className="text-right">
      <span className="rounded-full bg-ochre px-3 py-1 text-xs font-semibold text-ink">
        Top {rank.topPercent}%
      </span>
      <p className="mt-1 text-[0.7rem] text-ink-faint">
        #{rank.rank} of {rank.players}
      </p>
    </div>
  );
}

function StreakStats({
  summary,
  combined,
}: {
  summary: ProfileSummary;
  combined: ReturnType<typeof combinedStreak>;
}) {
  const stats = [
    { label: "Current streak", value: combined?.currentStreak ?? 0 },
    { label: "Longest streak", value: combined?.longestStreak ?? 0 },
    { label: "Active days", value: summary.totalActiveDays },
    { label: "Puzzles solved", value: summary.totalSolved },
  ];

  return (
    <section aria-labelledby="streaks-heading">
      <h2
        id="streaks-heading"
        className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
      >
        Streaks
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-ink/10 bg-parchment-dark px-3 py-3"
          >
            <dd className="font-display text-2xl leading-none">{stat.value}</dd>
            <dt className="mt-1.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink-faint">
              {stat.label}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Packs replace Easy/Medium/Hard as the breakdown axis (Section 5.3). */
function PackBreakdown({ summary }: { summary: ProfileSummary }) {
  const best = Math.max(1, ...summary.packs.map((p) => p.solved));

  return (
    <section aria-labelledby="packs-heading">
      <h2
        id="packs-heading"
        className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-faint"
      >
        Solved by pack
      </h2>

      {summary.packs.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-ink/20 p-4 text-sm text-ink-faint">
          Nothing solved yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.packs.map((pack) => (
            <li key={pack.slug} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm">{pack.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-parchment-dark">
                <span
                  className="block h-full rounded-full bg-moss"
                  style={{ width: `${(pack.solved / best) * 100}%` }}
                />
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-ink-faint">
                {pack.solved} of {pack.played}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Earned badges, most recent first (the SQL orders by `earned_at desc`).
 *
 * The first card is the "most recently earned, highlighted" one from
 * GamePlan.md Section 6, and carries the one deliberate motion moment on this
 * page: a short reveal on mount. Everything else is static, and the global
 * `prefers-reduced-motion` reset in globals.css switches the animation off for
 * anyone who has asked for that.
 */
function BadgeGrid({ badges }: { badges: EarnedBadge[] }) {
  if (badges.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-dashed border-ink/20 p-4 text-sm text-ink-faint">
        No badges yet. They start unlocking with your first solve, then with
        streaks and pack milestones.
      </p>
    );
  }

  return (
    <ul className="mt-3 grid grid-cols-3 gap-2">
      {badges.map((badge, index) => {
        const newest = index === 0;
        return (
          <li
            key={badge.slug}
            title={`${badge.name} - ${badge.description}`}
            className={`rounded-md border px-2 py-3 text-center ${
              newest
                ? "badge-reveal border-ochre bg-ochre/15"
                : "border-ink/10 bg-parchment-dark"
            }`}
          >
            {badge.iconUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- badge art host is not chosen yet */
              <img src={badge.iconUrl} alt="" className="mx-auto size-6" />
            ) : (
              <span aria-hidden className="block text-xl">
                {newest ? "\u{1F396}\u{FE0F}" : "\u{1F3C5}"}
              </span>
            )}
            <span className="mt-1 block text-[0.65rem] font-medium leading-tight">
              {badge.name}
            </span>
            {newest && (
              <span className="mt-0.5 block text-[0.55rem] uppercase tracking-[0.1em] text-ochre">
                Newest
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

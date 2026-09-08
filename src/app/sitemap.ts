import type { MetadataRoute } from "next";

import { getArchivePage } from "@/lib/archive/archive.server";
import { SITE_URL } from "@/lib/env";
import { getVisiblePacks } from "@/lib/packs.server";

/**
 * Sitemap (GamePlan.md Section 5.1 — the archive is the SEO engine).
 *
 * Lists the hub, the leaderboard, and for every visible pack: its play page,
 * its archive index and every finished puzzle.
 *
 * It deliberately contains no page whose content changes with who is asking —
 * no profiles, no settings, no auth. And because archive entries come from
 * `getArchivePage`, today's puzzle cannot appear here either; the same
 * `date < today` rule that governs the pages governs the sitemap.
 *
 * Regenerated hourly rather than per request: it grows by one entry a day per
 * pack, so anything faster is wasted work.
 */
export const revalidate = 3600;

/** Well under the 50,000-URL limit for years; a cap keeps it honest. */
const MAX_ARCHIVE_URLS_PER_PACK = 5_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const packs = await getVisiblePacks();

  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/leaderboard`, changeFrequency: "daily", priority: 0.6 },
  ];

  for (const pack of packs) {
    entries.push(
      {
        url: `${base}/play/${pack.slug}`,
        changeFrequency: "daily",
        priority: 0.9,
      },
      {
        url: `${base}/archive/${pack.slug}`,
        changeFrequency: "daily",
        priority: 0.7,
      },
    );

    const { entries: past } = await getArchivePage(pack.slug, 0, MAX_ARCHIVE_URLS_PER_PACK);

    for (const entry of past) {
      entries.push({
        url: `${base}/archive/${pack.slug}/${entry.date}`,
        // A finished puzzle never changes again.
        lastModified: new Date(`${entry.date}T00:00:00Z`),
        changeFrequency: "yearly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
